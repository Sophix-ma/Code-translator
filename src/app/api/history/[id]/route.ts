import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/history/[id] - Get a specific history entry
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const entry = await db.translationHistory.findUnique({
      where: { id },
    });
    if (!entry) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(entry);
  } catch (error) {
    console.error('Failed to fetch history entry:', error);
    return NextResponse.json({ error: 'Failed to fetch entry' }, { status: 500 });
  }
}

// PUT /api/history/[id] - Update a history entry
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const entry = await db.translationHistory.update({
      where: { id },
      data: body,
    });
    return NextResponse.json(entry);
  } catch (error) {
    console.error('Failed to update history:', error);
    return NextResponse.json({ error: 'Failed to update entry' }, { status: 500 });
  }
}

// DELETE /api/history/[id] - Delete a history entry
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.translationHistory.delete({
      where: { id },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete history:', error);
    return NextResponse.json({ error: 'Failed to delete entry' }, { status: 500 });
  }
}
