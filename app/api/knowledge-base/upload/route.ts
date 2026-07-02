import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import pdfParse from 'pdf-parse';
import * as mammoth from 'mammoth';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const campaignId = formData.get('campaignId') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File exceeds 10MB limit' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    let extractedText = '';
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    
    try {
      if (fileExtension === 'pdf') {
        const data = await pdfParse(buffer);
        extractedText = data.text;
      } else if (fileExtension === 'docx') {
        const result = await mammoth.extractRawText({ buffer });
        extractedText = result.value;
      } else if (['txt', 'md', 'csv', 'json'].includes(fileExtension || '')) {
        extractedText = buffer.toString('utf-8');
      } else {
        return NextResponse.json({ error: 'We could not read this file. Please upload a text-based PDF, DOCX, TXT, CSV, Markdown, or JSON file.' }, { status: 400 });
      }
    } catch (extractError) {
      console.error('Extraction error:', extractError);
      return NextResponse.json({ error: 'We could not read this file. Please upload a text-based PDF, DOCX, TXT, CSV, Markdown, or JSON file.' }, { status: 400 });
    }

    extractedText = extractedText.replace(/\s+/g, ' ').trim();
    if (!extractedText) {
      return NextResponse.json({ error: 'File contains no readable text.' }, { status: 400 });
    }

    const summary = extractedText.substring(0, 200) + '...'; // Basic summary

    const kbFile = await prisma.knowledgeBaseFile.create({
      data: {
        userId: user.id,
        campaignId: campaignId || null,
        fileName: file.name,
        fileType: file.type || fileExtension || 'unknown',
        fileSize: file.size,
        extractedText: extractedText,
        summary: summary,
        status: 'Ready'
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Knowledge file uploaded and ready.',
      file: {
        id: kbFile.id,
        fileName: kbFile.fileName,
        summary: kbFile.summary,
        status: kbFile.status
      }
    });
  } catch (error: any) {
    console.error('Knowledge Base Upload error:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
