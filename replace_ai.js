const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) { 
      results = results.concat(walk(file));
    } else { 
      if (file.endsWith('.ts') || file.endsWith('.tsx')) results.push(file);
    }
  });
  return results;
}

const files = [...walk('./app/api'), ...walk('./lib')];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  // Replacements
  content = content.replace(/services\/openrouter/g, 'services/bayofassets');
  content = content.replace(/OPENROUTER_API_KEY/g, 'BAYOFASSETS_API_KEY');
  content = content.replace(/OPENROUTER_MODEL/g, 'BAYOFASSETS_MODEL');
  content = content.replace(/openrouterKeyEncrypted/g, 'bayOfAssetsKeyEncrypted');
  content = content.replace(/openrouterModel/g, 'bayOfAssetsModel');
  content = content.replace(/openrouterKey/g, 'bayOfAssetsKey');
  content = content.replace(/openRouterKey/g, 'bayOfAssetsKey');
  content = content.replace(/OpenRouter API key is not configured/gi, 'Bay of Assets API key is not configured');
  content = content.replace(/OpenRouter API key missing/gi, 'Bay of Assets API key missing');
  content = content.replace(/OpenRouter key missing/gi, 'Bay of Assets key missing');
  content = content.replace(/OpenRouter API Error/gi, 'Bay of Assets API Error');
  content = content.replace(/OpenRouter Error/gi, 'Bay of Assets Error');
  content = content.replace(/provider:\s*'OpenRouter'/g, "provider: 'Bay of Assets'");
  content = content.replace(/https:\/\/openrouter\.ai\/api\/v1\/chat\/completions/g, '${process.env.BAYOFASSETS_BASE_URL}/chat/completions');

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    console.log('Updated', file);
  }
});
