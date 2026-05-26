// Test the regex string as stored in findRegex
const findRegex = '/<var\\s+name=([\"\\x27])([^\"\\x27]+?)\\1\\s+value=([\"\\x27])([^\"\\x27]*?)\\3\\s*\\/>/gi';

// regexFromString
const m = findRegex.match(/^\/(.+)\/([gimsuy]*)$/);
const body = m[1];
const flags = m[2];
console.log('Body:', body);
const re = new RegExp(body, flags);

// Test cases
const tests = [
  '<var name="hp" value="12"/>',
  "<var name='hp' value='12'/>",
  '<var name="san" value="60"/> <var name="mp" value="12"/>',
  '一些文字 <var name="location" value="书房"/> 更多文字',
];

for (const t of tests) {
  re.lastIndex = 0;
  const matches = [...t.matchAll(re)];
  console.log('Test:', t.substring(0,60));
  if (matches.length > 0) {
    for (const m of matches) {
      console.log('  name:', m[2], 'value:', m[4]);
    }
  } else {
    console.log('  NO MATCH');
  }
}
