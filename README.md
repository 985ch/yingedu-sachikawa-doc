config格式如下
```js
'use strict';
module.exports = {
  // showdoc服务器
  showdoc: {
    apiKey: '************',
    apiToken: '****************',
    homePage: 'https://xxx.com',
    itemID: 1,
  },
  // 数据库配置
  dbConfig: {
    kefuSystem: {
      path: '数据库',
      groups: [ '用户', '销售', '其他' ],
    },
  },
  apiConfig: {
    specialParamNames: [],
    groups: [ '对外接口', '对内接口', '其他' ],
    indexDocPath: 'API说明',
    indexFileName: '接口索引',
    docPath: '接口信息',
  },
};

```

