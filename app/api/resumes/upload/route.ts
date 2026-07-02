import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('resume') as File | null;
    const candidateProfileId = formData.get('candidateProfileId') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });
    }

    const MAX_SIZE_MB = parseInt(process.env.MAX_RESUME_FILE_SIZE_MB || '30');
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return NextResponse.json({ error: `File size exceeds ${MAX_SIZE_MB}MB limit.` }, { status: 400 });
    }

    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Unsupported file type. Only PDF and DOCX are allowed.' }, { status: 400 });
    }

    const uploadDir = path.join(process.cwd(), 'uploads', 'resumes');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const ext = file.type === 'application/pdf' ? '.pdf' : '.docx';
    const fileName = `${user.id}_${Date.now()}${ext}`;
    const filePath = path.join(uploadDir, fileName);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    fs.writeFileSync(filePath, buffer);

    // Extract Text
    let extractedText = '';
    try {
      if (ext === '.pdf') {
        const pdfData = await pdfParse(buffer);
        extractedText = pdfData.text;
      } else {
        const docxData = await mammoth.extractRawText({ buffer });
        extractedText = docxData.value;
      }
    } catch (extractError) {
      console.error('Text extraction failed:', extractError);
      return NextResponse.json({ error: 'Failed to extract text from the document.' }, { status: 500 });
    }

    // Call OpenRouter for Analysis
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    let structuredData = null;
    let status = 'Pending AI Analysis';
    
    if (openRouterKey) {
      const prompt = `You are an expert resume parser.

Extract structured information only from the supplied resume text.

Do not invent missing information.

Resume Text:
${extractedText.substring(0, 10000)} // Limit length if necessary

Return only valid JSON without markdown:
{
"candidateName": "",
"email": null,
"phone": null,
"location": null,
"skills": [],
"yearsOfExperience": null,
"education": [],
"certifications": [],
"jobTitles": [],
"industries": [],
"tools": [],
"summary": ""
}`;
      try {
        const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openRouterKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' }
          })
        });

        if (aiRes.ok) {
          const aiData = await aiRes.json();
          const content = aiData.choices[0].message.content.replace(/```json\n?|```\n?/g, '');
          structuredData = JSON.parse(content);
          status = 'Completed';
          
          await prisma.aPIUsage.create({
            data: {
              userId: user.id,
              provider: 'OpenRouter',
              endpoint: '/resume-parse',
              requestCount: 1,
            }
          });
        }
      } catch (aiErr) {
        console.error('AI Parsing failed:', aiErr);
        status = 'AI Analysis Failed';
      }
    }

    // Create Candidate Profile if needed
    let finalProfileId = candidateProfileId;
    if (!finalProfileId && structuredData) {
      const newProfile = await prisma.candidateProfile.create({
        data: {
          userId: user.id,
          firstName: structuredData.candidateName?.split(' ')[0] || 'Unknown',
          lastName: structuredData.candidateName?.split(' ').slice(1).join(' ') || '',
          email: structuredData.email || null,
          phone: structuredData.phone || null,
          city: structuredData.location || null,
          skills: JSON.stringify(structuredData.skills || []),
          yearsOfExperience: structuredData.yearsOfExperience ? String(structuredData.yearsOfExperience) : null,
          education: JSON.stringify(structuredData.education || []),
          certifications: JSON.stringify(structuredData.certifications || []),
          currentJobTitle: structuredData.jobTitles?.[0] || null,
          profileSummary: structuredData.summary || null,
        }
      });
      finalProfileId = newProfile.id;
    }

    const resume = await prisma.resume.create({
      data: {
        userId: user.id,
        candidateProfileId: finalProfileId || null,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        storagePath: filePath,
        extractedText: extractedText,
        structuredData: structuredData ? JSON.stringify(structuredData) : null,
        status: status,
      }
    });

    return NextResponse.json({ resume, candidateProfileId: finalProfileId });

  } catch (error: any) {
    console.error('Resume Upload Error:', error);
    return NextResponse.json({ error: error.message || 'An unexpected error occurred.' }, { status: 500 });
  }
}
