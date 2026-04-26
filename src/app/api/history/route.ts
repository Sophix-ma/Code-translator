import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/history - List all translation history
export async function GET() {
  try {
    const history = await db.translationHistory.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return NextResponse.json(history);
  } catch (error) {
    console.error('Failed to fetch history:', error);
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
  }
}

// POST /api/history - Create a new history entry
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, sourceLang, targetLang, sourceFiles, translatedFiles, status, fileCount, translatedCount, llmModel } = body;

    const entry = await db.translationHistory.create({
      data: {
        sessionId,
        sourceLang,
        targetLang,
        sourceFiles: JSON.stringify(sourceFiles),
        translatedFiles: JSON.stringify(translatedFiles),
        status,
        fileCount: fileCount || 0,
        translatedCount: translatedCount || 0,
        llmModel: llmModel || '',
      },
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error('Failed to create history:', error);
    return NextResponse.json({ error: 'Failed to create history' }, { status: 500 });
  }
}
