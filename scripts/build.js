const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const crypto = require('crypto');

const PROMPTS_DIR = path.join(__dirname, '../../prompts');
const OUTPUT_FILE = path.join(__dirname, '../../prompts.json');

/**
 * 基于相对路径生成稳定的数字 ID（范围 1 ~ 2^31-1）
 */
function generateStableId(relativePath) {
    const hash = crypto.createHash('md5').update(relativePath).digest('hex');
    const decimal = parseInt(hash.slice(0, 8), 16);
    return (decimal % 2147483647) + 1;
}

/**
 * 如果全文被一对 Markdown 围栏包裹，则剥离外层围栏
 */
function stripOuterFences(content) {
    const trimmed = content.trim();
    const match = trimmed.match(/^```[\w]*\s*\n([\s\S]*?)\n\s*```$/);
    if (match) {
        return match[1].trim();
    }
    return content;
}

/**
 * 递归遍历目录，收集所有 .md 文件路径
 */
function getAllMdFiles(dir, baseDir = dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(item => {
        const itemPath = path.join(dir, item);
        const stat = fs.statSync(itemPath);
        if (stat.isDirectory()) {
            results = results.concat(getAllMdFiles(itemPath, baseDir));
        } else if (item.endsWith('.md')) {
            const relativePath = path.relative(baseDir, itemPath);
            results.push({ filePath: itemPath, relativePath });
        }
    });
    return results;
}

// 获取所有 .md 文件
const mdFiles = getAllMdFiles(PROMPTS_DIR);

if (mdFiles.length === 0) {
    console.warn('⚠️ prompts 目录中没有找到 .md 文件，生成空数组。');
    fs.writeFileSync(OUTPUT_FILE, '[]', 'utf8');
    process.exit(0);
}

const promptData = mdFiles.map(({ filePath, relativePath }) => {
    const content = fs.readFileSync(filePath, 'utf8');
    const { data, content: body } = matter(content);

    const cleanContent = stripOuterFences(body);

    // ---- 分类自动识别 ----
    let category = data.category;
    if (!category) {
        const dirName = path.dirname(relativePath);
        if (dirName !== '.' && dirName !== '') {
            const firstLevelDir = dirName.split(path.sep)[0];
            category = firstLevelDir;
        } else {
            category = '其他';
        }
    }

    // ---- ID 生成（优先级：frontmatter > 稳定哈希） ----
    let id;
    if (data.id) {
        id = parseInt(data.id, 10);
    } else {
        id = generateStableId(relativePath);
    }

    const stats = fs.statSync(filePath);
    const createdAt = data.createdAt || stats.mtime.toISOString().split('T')[0];

    return {
        id: id,
        title: data.title || path.basename(filePath, '.md'),
        description: data.description || '',
        content: cleanContent,
        category: category,
        tags: Array.isArray(data.tags) ? data.tags : [],
        createdAt: createdAt
    };
});

// 按 id 排序
promptData.sort((a, b) => a.id - b.id);

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(promptData, null, 2), 'utf8');
console.log(`✅ 已生成 prompts.json，共 ${promptData.length} 条数据`);
console.log(`📂 自动识别到的分类: ${[...new Set(promptData.map(p => p.category))].join(', ')}`);