const fs = require('fs');
const path = 'admin-panel/backend/src/routes/checklists.js';
let content = fs.readFileSync(path, 'utf8');

const oldCode = `                    data: {
                        status: 'COMPLETED',
                        responses: responses || {},
                        metadata: metadata || {},`;

const newCode = `                    data: {
                        status: 'COMPLETED',
                        responses: responses || {},
                        metadata: {
                            ...(typeof existing.metadata === 'object' && existing.metadata ? existing.metadata : {}),
                            ...(metadata || {})
                        },`;

if (content.includes(oldCode)) {
    content = content.replace(oldCode, newCode);
    fs.writeFileSync(path, content);
    print("Backend patched: metadata merge.");
} else {
    console.error("String NOT found logic!");
}
