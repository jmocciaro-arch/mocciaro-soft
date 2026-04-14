-- =====================================================
-- Migration v7: Client Merge — deduplication function
-- =====================================================
-- Provides merge_clients() to unify duplicate client
-- records, reassigning all foreign keys atomically.

-- Function: merge_clients(primary_id UUID, secondary_ids UUID[])
-- Returns: JSON with merge results
CREATE OR REPLACE FUNCTION merge_clients(
  p_primary_id UUID,
  p_secondary_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_secondary UUID;
  v_counts JSONB := '{}';
  v_total_moved INT := 0;
  v_cnt INT;
BEGIN
  -- Validate primary exists and is active
  IF NOT EXISTS (SELECT 1 FROM tt_clients WHERE id = p_primary_id AND active = true) THEN
    RAISE EXCEPTION 'Primary client % not found or inactive', p_primary_id;
  END IF;

  -- Process each secondary client
  FOREACH v_secondary IN ARRAY p_secondary_ids
  LOOP
    IF v_secondary = p_primary_id THEN
      CONTINUE; -- skip if same as primary
    END IF;

    -- 1. Reassign tt_quotes
    UPDATE tt_quotes SET client_id = p_primary_id WHERE client_id = v_secondary;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_total_moved := v_total_moved + v_cnt;

    -- 2. Reassign tt_opportunities
    UPDATE tt_opportunities SET client_id = p_primary_id WHERE client_id = v_secondary;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_total_moved := v_total_moved + v_cnt;

    -- 3. Reassign tt_sales_orders
    UPDATE tt_sales_orders SET client_id = p_primary_id WHERE client_id = v_secondary;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_total_moved := v_total_moved + v_cnt;

    -- 4. Reassign tt_sat_tickets
    UPDATE tt_sat_tickets SET client_id = p_primary_id WHERE client_id = v_secondary;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_total_moved := v_total_moved + v_cnt;

    -- 5. Reassign tt_documents
    UPDATE tt_documents SET client_id = p_primary_id WHERE client_id = v_secondary;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_total_moved := v_total_moved + v_cnt;

    -- 6. Reassign tt_mail_followups
    UPDATE tt_mail_followups SET client_id = p_primary_id WHERE client_id = v_secondary;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_total_moved := v_total_moved + v_cnt;

    -- 7. Reassign tt_alerts
    UPDATE tt_alerts SET client_id = p_primary_id WHERE client_id = v_secondary;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_total_moved := v_total_moved + v_cnt;

    -- 8. Reassign tt_process_instances (uses customer_id)
    UPDATE tt_process_instances SET customer_id = p_primary_id WHERE customer_id = v_secondary;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_total_moved := v_total_moved + v_cnt;

    -- 9. Move contacts (avoid dupes by name)
    INSERT INTO tt_client_contacts (client_id, name, position, email, phone, is_primary)
    SELECT p_primary_id, c.name, c.position, c.email, c.phone, false
    FROM tt_client_contacts c
    WHERE c.client_id = v_secondary
      AND NOT EXISTS (
        SELECT 1 FROM tt_client_contacts e
        WHERE e.client_id = p_primary_id
          AND UPPER(TRIM(e.name)) = UPPER(TRIM(c.name))
      );
    -- Delete remaining contacts of secondary (they were either moved or are dupes)
    DELETE FROM tt_client_contacts WHERE client_id = v_secondary;

    -- 10. Move addresses
    UPDATE tt_client_addresses SET client_id = p_primary_id WHERE client_id = v_secondary;

    -- 11. Fill empty fields on primary from secondary
    UPDATE tt_clients SET
      tax_id = COALESCE(tt_clients.tax_id, sec.tax_id),
      email = COALESCE(tt_clients.email, sec.email),
      phone = COALESCE(tt_clients.phone, sec.phone),
      address = COALESCE(tt_clients.address, sec.address),
      city = COALESCE(tt_clients.city, sec.city),
      state = COALESCE(tt_clients.state, sec.state),
      postal_code = COALESCE(tt_clients.postal_code, sec.postal_code),
      website = COALESCE(tt_clients.website, sec.website),
      notes = CASE
        WHEN tt_clients.notes IS NULL THEN sec.notes
        WHEN sec.notes IS NOT NULL THEN tt_clients.notes || E'\n---\n' || sec.notes
        ELSE tt_clients.notes
      END,
      total_revenue = tt_clients.total_revenue + COALESCE(sec.total_revenue, 0)
    FROM tt_clients sec
    WHERE tt_clients.id = p_primary_id
      AND sec.id = v_secondary;

    -- 12. Deactivate secondary
    UPDATE tt_clients SET
      active = false,
      notes = COALESCE(notes, '') || E'\n[MERGED into ' || p_primary_id::TEXT || ' on ' || NOW()::TEXT || ']'
    WHERE id = v_secondary;

  END LOOP;

  -- 13. Audit log
  INSERT INTO tt_activity_log (entity_type, entity_id, action, description)
  VALUES (
    'client',
    p_primary_id,
    'merge',
    'Merged ' || array_length(p_secondary_ids, 1) || ' duplicate(s). Total records reassigned: ' || v_total_moved
  );

  RETURN jsonb_build_object(
    'primary_id', p_primary_id,
    'merged_count', array_length(p_secondary_ids, 1),
    'records_reassigned', v_total_moved
  );
END;
$$;
