import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load .env.local for local development (on Vercel, env vars come from dashboard)
try {
    dotenv.config({ path: '.env.local' });
    const envPath = path.resolve('.env.local');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        envContent.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const parts = trimmed.split('=');
                if (parts.length >= 2) {
                    const key = parts[0].trim();
                    const value = parts.slice(1).join('=').trim();
                    if (!process.env[key]) process.env[key] = value;
                }
            }
        });
    }
} catch (e) { /* Silently ignore on Vercel */ }

function minutesToTime(minutes) {
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { tasks, logs } = req.body;
    const geminiKey = process.env.GEMINI;

    if (!geminiKey) {
        return res.status(400).json({ error: "Gemini API key is not configured. Set GEMINI in Vercel dashboard or .env.local." });
    }

    try {
        const systemPrompt = `당신은 건설 현장 총괄 인공지능 관리 에이전트 [CORA]입니다.
현장 상황(날씨, 교통, 돌발 사고)에 따른 스케줄 조정 분석 보고서를 정교하고 전문적인 한국어로 작성하십시오.
대상의 직급은 [김준석 팀장]이며, 부드럽고 품격 있는 격식체를 사용하십시오.

스케줄 변경 사유와 구체적인 조치 사항을 작성하며, 다음의 형식을 엄격히 준수하여 마크다운 포맷으로 출력하십시오.

**형식 규칙:**
1. **[실시간 상황 인식 분석 요약]**
   - 현재 상황(날씨, 교통, 특이사항)에 따른 종합 스케줄 영향도 평가 (1~2문장).
2. **[김준석 팀장 행동 지침 및 핵심 수칙 권고]**
   - 관리자가 반드시 현장에서 조치해야 하는 핵심 행동 지침 2가지를 📌 이모지와 함께 명확히 작성.
3. **[공정별 대기 수칙 안내]**
   - 각 작업유형별(수송, 건설, 야외 작업 등) 주의 대기 명령을 한 문장씩 작성.

**분석 데이터 컨텍스트:**
- 실시간 상황 로그:
${logs.map(log => `- ${log}`).join("\n")}

- 조정 후 타임라인 정보:
${tasks.map(t => `- [${t.title}] (${t.startTime} -> ${t.finalStart ? minutesToTime(t.finalStart) : '보류'}) | 상태: ${t.status === 'normal' ? '정상' : t.status === 'delayed' ? '지연' : '보류'} | 원인: ${t.reasons.join(", ") || '없음'}`).join("\n")}
`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${geminiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: systemPrompt }] }]
            })
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error?.message || "Gemini API request failed");
        }

        const resData = await response.json();
        const briefingText = resData.candidates?.[0]?.content?.parts?.[0]?.text || "AI 분석 결과를 가져올 수 없습니다.";

        res.json({ explanation: briefingText });
    } catch (e) {
        console.error("Gemini error:", e);
        res.status(500).json({ error: e.message });
    }
}
