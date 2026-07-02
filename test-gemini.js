fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
  method:'POST',
  headers:{
    'x-goog-api-key':'YOUR_API_KEY_HERE',
    'Content-Type':'application/json'
  },
  body:JSON.stringify({
    contents:[{role:'user',parts:[{text:'Return ONLY valid JSON. Required schema: {"emails": [{"step": 1, "delayDays": 0, "subject": "Quick question", "body": "Hi {{firstName}}"}]}'}]}],
    generationConfig:{temperature:0.2,responseMimeType:'application/json'}
  })
}).then(r=>r.text()).then(console.log).catch(console.error);
