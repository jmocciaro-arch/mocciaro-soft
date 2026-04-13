import { NextResponse } from 'next/server'
import { getOrCreateThread, getMessages, postMessage } from '@/lib/process-engine'

// GET /api/threads?entity_type=X&entity_id=Y — get thread + messages for entity
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const entityType = searchParams.get('entity_type')
    const entityId = searchParams.get('entity_id')
    if (!entityType || !entityId) {
      return NextResponse.json({ error: 'entity_type and entity_id required' }, { status: 400 })
    }

    const threadId = await getOrCreateThread(entityType, entityId)
    const messages = await getMessages(threadId)
    return NextResponse.json({ thread_id: threadId, messages })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

// POST /api/threads — post a message
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { thread_id, entity_type, entity_id, author_user_id, content, is_internal, attachments, mentions } = body

    let targetThreadId = thread_id
    if (!targetThreadId && entity_type && entity_id) {
      targetThreadId = await getOrCreateThread(entity_type, entity_id, author_user_id)
    }
    if (!targetThreadId || !content) {
      return NextResponse.json({ error: 'thread_id (or entity_type+entity_id) and content required' }, { status: 400 })
    }

    await postMessage(targetThreadId, author_user_id, content, { is_internal, attachments, mentions })
    return NextResponse.json({ success: true, thread_id: targetThreadId }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
