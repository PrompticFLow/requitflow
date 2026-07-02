import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const hasJobBoard = !!process.env.JOB_BOARD_API_KEY;
    const hasOpenRouter = !!process.env.OPENROUTER_API_KEY;
    const hasNvidia = !!process.env.NVIDIA_API_KEY;
    const activeProvider = process.env.AI_PROVIDER === 'nvidia' ? 'NVIDIA' : 'OpenRouter';

    return NextResponse.json({
      settings: {
        jobBoardConfigured: hasJobBoard,
        openRouterConfigured: hasOpenRouter,
        nvidiaConfigured: hasNvidia,
        activeProvider,
        defaultCountry: 'US',
        cacheDuration: 60,
        dailyLimit: process.env.JOB_SEARCH_DAILY_LIMIT || '100',
        aiBatchSize: process.env.AI_JOB_ANALYSIS_BATCH_SIZE || '10',
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
