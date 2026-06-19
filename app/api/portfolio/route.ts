import { NextResponse } from 'next/server';
import { getPortfolioData } from '@/app/lib/portfolio-data';

export const revalidate = 60;

export async function GET() {
  try {
    const data = await getPortfolioData();

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (error) {
    console.error('Failed to load Sanity portfolio data.', error);
    return NextResponse.json(
      {
        error: '프로젝트 데이터를 불러오지 못했습니다.',
        projects: [],
        categories: [],
        settings: null,
      },
      { status: 500 },
    );
  }
}
