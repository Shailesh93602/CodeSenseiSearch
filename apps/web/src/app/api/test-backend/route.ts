// Test API route to verify backend connectivity from Next.js
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
    
    // Test health check
    const healthResponse = await fetch(`${apiUrl}/health`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });
    
    if (!healthResponse.ok) {
      throw new Error(`Backend health check failed: ${healthResponse.status}`);
    }
    
    const healthData = await healthResponse.json();
    
    // Test search
    const searchResponse = await fetch(`${apiUrl}/search/hybrid`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        query: 'react hooks',
        limit: 3,
      }),
    });
    
    if (!searchResponse.ok) {
      throw new Error(`Backend search failed: ${searchResponse.status}`);
    }
    
    const searchData = await searchResponse.json();
    
    return NextResponse.json({
      success: true,
      message: 'Backend connectivity test successful',
      apiUrl,
      tests: {
        health: {
          status: 'passed',
          data: healthData,
        },
        search: {
          status: 'passed',
          results: searchData.data?.results?.length || 0,
          totalResults: searchData.data?.totalResults || 0,
          searchTime: searchData.data?.searchTime || 0,
        },
      },
    });
    
  } catch (error) {
    console.error('Backend connectivity test failed:', error);
    
    return NextResponse.json(
      {
        success: false,
        message: 'Backend connectivity test failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
      },
      { status: 500 }
    );
  }
}