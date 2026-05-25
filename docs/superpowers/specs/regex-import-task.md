# 正则导入任务

## 来源
SillyTavern 预设 JSON 文件中的 `extensions.regex_scripts` 数组包含正则脚本。

## 格式
```json
{
  "extensions": {
    "regex_scripts": [
      {
        "id": "uuid",
        "scriptName": "脚本名称",
        "findRegex": "/pattern/flags",
        "replaceString": "$1",
        "trimStrings": [],
        "placement": [2],
        "disabled": false,
        "markdownOnly": true,
        "promptOnly": true,
        "runOnEdit": true,
        "substituteRegex": 0,
        "minDepth": null,
        "maxDepth": null
      }
    ]
  }
}
```

## 映射关系
- `scriptName` → `RegexScript.scriptName`
- `findRegex` → `RegexScript.findRegex`
- `replaceString` → `RegexScript.replaceString`
- `placement` → `RegexScript.placement` (1=用户输入,2=AI输出,3=命令,5=世界信息,6=推理)
- `disabled` → `RegexScript.disabled`
- `markdownOnly` → `RegexScript.markdownOnly`
- `promptOnly` → `RegexScript.promptOnly`
- `substituteRegex` → `RegexScript.substituteRegex`
- `minDepth`/`maxDepth` → `RegexScript.minDepth`/`maxDepth`

## 实现位置
- 解析: `src/sillytavern/format-converter.ts` — 新增 `importRegexScriptsFromST()`
- UI: `src/components/Settings/RegexPanel.tsx` — 新增"导入ST预设正则"按钮
- 或: `src/components/Settings/SettingsPanel.tsx` 正则侧栏

## 状态
待实现
