const fs = require('fs');
const path = require('path');
const { PdfReader } = require('pdfreader');

const INPUT_FOLDER = './PDFs'; 
const OUTPUT_JSON_PATH = './questions_db.json';

function extractTextFromPDF(filePath) {
    return new Promise((resolve, reject) => {
        let fullText = '';
        new PdfReader().parseFileItems(filePath, (err, item) => {
            if (err) {
                reject(err);
            } else if (!item) {
                resolve(fullText);
            } else if (item.text) {
                fullText += item.text;
            }
        });
    });
}

async function processAllPDFs() {
    let existingDB = [];
    let existingTopics = new Set();

    if (fs.existsSync(OUTPUT_JSON_PATH)) {
        try {
            const rawData = fs.readFileSync(OUTPUT_JSON_PATH, 'utf-8');
            existingDB = JSON.parse(rawData);
            existingDB.forEach(q => existingTopics.add(q.topic));
            console.log(`📂 已載入現有資料庫，準備進行更新...`);
        } catch (error) {
            console.error('❌ 解析 JSON 失敗，將以空資料庫開始。');
        }
    }

    if (!fs.existsSync(INPUT_FOLDER)) return;
    const files = fs.readdirSync(INPUT_FOLDER).filter(file => file.toLowerCase().endsWith('.pdf'));

    let isUpdated = false;

    for (const file of files) {
        const topicName = path.basename(file, '.pdf');

        console.log(`⏳ 正在處理題庫：${file}...`);
        const filePath = path.join(INPUT_FOLDER, file);

        try {
            const rawText = await extractTextFromPDF(filePath);
            
            // 【終極進化 1：文字正規化】
            // 1. 去除換行
            // 2. 括號與頓號轉標準半形
            // 3. 把所有「全形英文字母」強制轉成「半形英文字母」
            let cleanText = rawText.replace(/\r?\n|\r/g, '')
                                   .replace(/（/g, '(').replace(/）/g, ')')
                                   .replace(/．/g, '.').replace(/、/g, '.')
                                   .replace(/[Ａ-Ｚａ-ｚ]/g, function(a) { 
                                        return String.fromCharCode(a.charCodeAt(0) - 65248); 
                                   });

            const regex = /\(\s*([A-D])\s*\)\s*(\d+)\s*\.\s*(.*?)\(\s*A\s*\)\s*(.*?)\(\s*B\s*\)\s*(.*?)\(\s*C\s*\)\s*(.*?)\(\s*D\s*\)\s*(.*?)(?=\(\s*[A-D]\s*\)\s*\d+\s*\.|$)/g;
            
            let match;
            let parsedCount = 0;

            while ((match = regex.exec(cleanText)) !== null) {
                const answerKey = match[1].toUpperCase();
                const id = parseInt(match[2]);
                const questionText = match[3].trim();
                
                // 【終極進化 2：除毛邊】清理選項尾巴可能黏到的頁碼
                const cleanOptionD = match[7].trim().replace(/。?\s*\d+$/, '').replace(/。$/, '');

                const options = [
                    match[4].trim().replace(/。$/, ''),
                    match[5].trim().replace(/。$/, ''),
                    match[6].trim().replace(/。$/, ''),
                    cleanOptionD
                ];

                const answerIndex = answerKey.charCodeAt(0) - 65; 
                const actualAnswerText = options[answerIndex];

                // 避免重複寫入
                const isDuplicate = existingDB.some(q => q.topic === topicName && q.id === id);
                if (!isDuplicate) {
                    existingDB.push({
                        id: id,
                        topic: topicName,
                        question: questionText,
                        options: options,
                        answer: actualAnswerText
                    });
                    parsedCount++;
                }
            }

            console.log(`   ✅ 「${topicName}」解析完成，成功辨識 ${parsedCount} 題。`);
            isUpdated = true;

        } catch (error) {
            console.error(`❌ 處理 ${file} 時發生錯誤：`, error);
        }
    }

    if (isUpdated) {
        fs.writeFileSync(OUTPUT_JSON_PATH, JSON.stringify(existingDB, null, 2), 'utf-8');
        console.log(`\n🎉 處理完畢！資料庫已成功更新，目前共有 ${existingDB.length} 題。`);
    }
}

// 執行主程式
processAllPDFs();