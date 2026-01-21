import nodemailer from 'nodemailer';
import { NextRequest, NextResponse } from 'next/server';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: true, // SSL
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { to, clientName, totalAmount, quoteNumber, pdfBase64 } = body;

    const mailOptions: nodemailer.SendMailOptions = {
      from: `"제이디자인" <${process.env.SMTP_USER}>`,
      to: to,
      subject: `[제이디자인] 견적서 #${quoteNumber}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
        </head>
        <body style="font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; margin: 0; padding: 20px; background-color: #f9fafb;">
          <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <!-- 헤더 -->
            <div style="background-color: #3b82f6; padding: 24px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px;">견적서</h1>
            </div>

            <!-- 본문 -->
            <div style="padding: 32px;">
              <p style="color: #374151; font-size: 16px; margin-bottom: 24px;">
                안녕하세요, <strong>${clientName}</strong>님.<br>
                요청하신 견적서를 보내드립니다.
              </p>

              <!-- 견적 정보 -->
              <div style="background-color: #f3f4f6; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
                <p style="margin: 0; color: #6b7280; font-size: 14px;">견적 번호: <strong style="color: #111827;">#${quoteNumber}</strong></p>
                <p style="margin: 8px 0 0; color: #6b7280; font-size: 14px;">발행일: <strong style="color: #111827;">${new Date().toLocaleDateString('ko-KR')}</strong></p>
                <p style="margin: 8px 0 0; color: #6b7280; font-size: 14px;">합계금액: <strong style="color: #3b82f6; font-size: 18px;">${totalAmount.toLocaleString()}원</strong></p>
              </div>

              <p style="color: #374151; font-size: 14px; margin-bottom: 16px;">
                <strong>첨부된 PDF 파일</strong>을 확인해주세요.
              </p>

              <!-- 계좌 정보 -->
              <div style="background-color: #fef3c7; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
                <p style="margin: 0; color: #92400e; font-size: 14px; font-weight: bold;">입금 계좌</p>
                <p style="margin: 8px 0 0; color: #92400e; font-size: 14px;">국민은행 910601-01-492454 (예금주: 이종헌)</p>
              </div>

              <p style="color: #6b7280; font-size: 14px; margin-top: 32px;">
                문의사항이 있으시면 언제든 연락 주세요.<br>
                TEL: 032-508-6954<br><br>
                감사합니다.
              </p>
            </div>

            <!-- 푸터 -->
            <div style="background-color: #f9fafb; padding: 16px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">제이디자인 | 인천시 부평구 장제로 145 701호</p>
            </div>
          </div>
        </body>
        </html>
      `,
      attachments: pdfBase64
        ? [
            {
              filename: `견적서_${quoteNumber}.pdf`,
              content: Buffer.from(pdfBase64, 'base64'),
              contentType: 'application/pdf',
            },
          ]
        : [],
    };

    await transporter.sendMail(mailOptions);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Email send error:', error);
    return NextResponse.json(
      { error: '이메일 발송에 실패했습니다.' },
      { status: 500 }
    );
  }
}
