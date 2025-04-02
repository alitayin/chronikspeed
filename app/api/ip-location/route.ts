import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const ip = searchParams.get('ip');
  
  if (!ip || ip === 'self') {
    try {
      // 获取用户真实 IP
      const userIp = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                     request.headers.get('x-real-ip') || 
                     '127.0.0.1';
      
      const response = await fetch(`http://ip-api.com/json/${userIp}?fields=status,country,city,query`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      return NextResponse.json(data);
    } catch (error) {
      console.error('获取用户IP位置信息失败:', error);
      return NextResponse.json({ 
        status: 'fail', 
        message: error instanceof Error ? error.message : '未知错误' 
      }, { status: 500 });
    }
  }
  
  try {
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,city`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('获取 IP 位置信息失败:', error);
    return NextResponse.json({ 
      status: 'fail', 
      message: error instanceof Error ? error.message : '未知错误' 
    }, { status: 500 });
  }
} 