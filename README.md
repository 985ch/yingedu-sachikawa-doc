# yingedu-sachikawa-doc

> 内部使用的文档生成工具，基于[egg-sachikawa框架](https://github.com/985ch/egg-sachikawa)开发，默认将文档上传至内部[showdoc](https://github.com/star7th/showdoc)服务器。

## 安装方法

```sh
npm i yingedu-sachikawa-doc --save-dev
```

## 注意事项

* 本项目是通过egg-bin test命令来生成数据模型，数据文档和接口文档的，因此本项目只支持[egg.js](https://eggjs.org/)项目
* 本项目目前只支持mysql的数据模型和数据文档生成
* 本项目生成的接口文档仅支持由[egg-router-factory](https://github.com/985ch/egg-router-factory)生成的接口

## 使用说明

1. 首先在项目根目录下执行```npm i yingedu-sachikawa-doc --save-dev```安装依赖
2. 然后在项目根目录下建立一个目录(例如```toolkit```)
3. 往该目录下添加3个文件如下
配置文件
```js
// toolkit/config.js

'use strict';
module.exports = {
  // showdoc服务器，仅验证过自建showdoc服务器
  showdoc: {
    apiKey: '************', // showdoc服务器提供的api_key
    apiToken: '****************', // showdoc服务器提供的api_token
    homePage: 'https://xxx.com', // showdoc站点地址
    itemID: 1, // 对应文档项目ID
  },
  // 需要生成模型的数据表
  tables: { // 需要给哪些表构建数据模型，为空对象表示生成所有表的模型
    mainDB: [ 'app', 'users' ],
  },
  // 数据库文档配置
  dbConfig: {
    kefuSystem: { // 数据库名字
      path: '数据库', // 数据库文档存放的路径
      groups: [ '用户', '销售', '其他' ], // 数据库分组，不在分组内的数据文档将不会加入索引
    },
  },
  // 接口文档配置
  apiConfig: {
    specialParamNames: [ 'guid' ], // 特殊参数，若在接口文件中配置了同名参数时会发出警告
    groups: [ '对外接口', '对内接口', '其他' ], // 接口分组，不在分组内的接口将不会加入索引
    indexDocPath: 'API说明', // 接口索引存放的路径
    indexFileName: '接口索引', // 接口索引文件名
    docPath: '接口信息', // 接口文件存放的路径
  },
};
```
API接口文档构建脚本
```js
// toolkit/build-apidocs.js

'use strict';

const config = require('./config');
const ApiDocBuilder = require('yingedu-sachikawa-doc');
const { app } = require('egg-mock/bootstrap');

describe('toolkit/build-apidocs.js', () => {
  it('build apidocs!', async () => {
    const builder = new ApiDocBuilder(app, config);
    await builder.buildDoc();
  });
});
```
数据模型和文档构建脚本
```js
// toolkit/build-models.js

'use strict';

const config = require('./config');
const { ModelBuilder } = require('yingedu-sachikawa-doc');
const { app } = require('egg-mock/bootstrap');

describe('toolkit/build-models.js', () => {
  it('build models!', async () => {
    const builder = new ModelBuilder(app, config);
    await builder.genDatabaseModels(process.argv.indexOf('--doc') >= 0);
  });
});
```
4. 修改```package.json```文件，在```scripts```下新增两个命令
```
    "gen-models": "egg-bin test toolkit/build-models.js",
    "gen-apidocs": "egg-bin test toolkit/build-apidocs.js"
```
5. 完成！现在可以使用npm的命令来生成数据模型和文档并自动提交到服务器了

## 命令行一览

* 仅生成数据模型，不生成数据文档：```npm run gen-models```
* 生成数据模型和数据文档，并上传文档：```npm run gen-models -- --doc```
* 生成数据模型和数据文档，但不上传：```npm run gen-models -- --doc --onlyTest```
* 生成接口文档并上传：```npm run gen-apidocs```
* 生成接口文档但不上传： ```npm run gen-apidocs -- --onlyTest```

## 关于数据库模型构造器（ModelBuilder）

* 数据模型构造器用于生成数据模型和文档，如果需要实现自定义的数据模型和文档内容，可以继承该类并改写其中的方法
* 表注释的完整格式是```#分组#注释内容```，若没有前面的```分组```部分，则该表默认加入```其他```分组
* ```ModelBuilder```的构造函数可以接受第三个参数```indexName```作为索引文件的文件名，其默认值是```索引```
* 数据模型构造器只会生成由大写或者小写字母开头的数据模型和文档，由其他字符开头的数据表将会被忽略
* 叫做```_comment```的数据表会被作为文档的补充注释表读取，其中的内容将会被录入到对应表的文档中。如果某个数据表的参数需要做很长的说明，建议写入该表
### 补充注释表（_comment）结构

|字段|类型|允许为空|默认值|注释|
|:---|:---|:---|---|---|
|tableName|VARCHAR(50)|否||表名|
|columnName|VARCHAR(50)|否||字段名|
|desc|TEXT|是||注释|

## 关于API文档构造器（ApiDocBuilder）

* API文档构造器用于生成接口文档，如果使用了自定义的中间件或者需要实现自定义的文档内容，则需要集成该类并改写其中的方法
* 绝大多数情况下，使用自定义的中间件都需要且只需要重新实现```getBaseText```和```getSpParamText```两个方法。以下是一个使用自定义中间件的例子：
```js
// toolkit/apidoc-builder.js

'use strict';

const _ = require('lodash');
const { ApiDocBuilder } = require('yingedu-sachikawa-doc');

class MyApiDocBuilder extends ApiDocBuilder {
  // 获取基本信息文本
  getBaseText(obj) {
    const { method, item } = obj;
    const { ip, cache, logger, rpcAuth, auth } = item;

    // 权限文本
    let authText = '无限制';
    if (rpcAuth) {
      authText = '限内部服务器访问\n' +
      '* 允许的访问来源：' + (_.isArray(rpcAuth) ? rpcAuth.join('，') : rpcAuth);
    }
    if (auth) {
      authText = '限登陆用户访问\n' +
      '* 需要的权限：' + (auth.check ? '特殊权限' : (auth.rule || '无'));
    }

    // 拼接完整简介文本
    return '## 基本信息\n\n' +
      '* 接口：【' + method + '】' + obj.path + '\n' +
      '* 访问权限：' + authText + '\n' +
      '* IP限制：' + ((ip || rpcAuth) ? '有限制' : '无限制') + '\n' +
      '* 接口缓存：' + (cache ? '启用' : '未启用') + '\n' +
      '* 操作日志：' + (logger ? '启用' : '未启用') + '\n\n';
  }
  // 获取特殊参数文本
  getSpParamText({ item }, paramComments) {
    const { params, rpcAuth, auth } = item;
    let text = '';

    if (!rpcAuth) {
      if (params && params.TTP) {
        paramComments.TTP = { desc: '调用接口的客户端，值只能是"pc"或"mobile"' };
      } else {
        text += '| TTP | string | 必填 | - | 调用接口的客户端，值只能是"pc"或"mobile" |\n';
      }
    } else {
      text += '| secretKey | string | 必填 | - | 后端密钥，用于鉴权和确定访问来源，请勿混用不同平台的密钥 |\n';
    }
    if (auth && !rpcAuth) {
      text += '| guid | string | 必填 | - | 用户有效guid，用于鉴权 |\n';
    }

    return text;
  }
}

module.exports = MyApiDocBuilder;
```
* ```ApiDocBuilder```的构造函数可以接受第三个参数```readerClass```，如果希望使用自定义的注释读取器，就可以传入该参数
* 通过继承```CommentReader```类并修改其中的方法，可以生成自己的注释读取器
* 接口生成器同时也是注释检查器，可以通过生成接口文档但不上传的命令来检查基本注释是否存在缺失

## 关于接口注释
因为接口文档是由接口文件的路由对象和接口文件的顶部注释共同决定的，因此在编写接口时必须要特别注意注释的编写，只有正确的编写接口的注释，才能生成更为完善的文档。
### 注释规范
* 必须确保每个接口文件都有注释
* 接口的注释必须放在接口文件的顶部
* 接口注释应该按照JSDoc的要求，以```/**```开头，以``` */```结束
* 接口注释的第一行是对接口功能的一句话简介，然后接着各种带标签的注释内容
* 无论接口是否有返回数据，都必须带有至少一个```returns```标签
* 带参数的接口，必须给每个参数都加上对应的注释，但是中间件自带的默认参数除外，中间件带的参数应当专门处理
* 尽量给每个接口都加上```group```标签，哪怕这个接口确实属于```其他```分类
### 典型例子
```js
/**
 * 获取用户信息
 * @group 用户管理
 * @param name 用户名，若不传入则返回所有用户的信息
 * @returns 单个用户
 * {
 *   name: '张三',
 *   age: 24,
 *   job: '程序员',
 *   salary: 5000, // 该字段可能为空，表示薪水保密
 * }
 * @returns 所有用户
 * [{
 *   name: '张三',
 *   age: 24,
 *   job: '程序员',
 *   salary: 5000, // 该字段可能为空，表示薪水保密
 * }]
 */

'use strict';

module.exports = app => {
  return {
    params: {
      name: { type: 'string', optional: true },
    },
    async controller() {
      const { state, service, success, fail } = this;
      const { name } = state.params;
      let result;
      if (name) {
        result = await service.user.find(name);
        if (!result) {
          return fail('找不到用户', app.errCode.NO_DATA);
        }
      } else {
        result = await service.user.listAll();
      }
      success(result);
    },
  };
};
```
### 标签详解

| 标签 | 允许多行 | 说明 |
|:----|:-----|:----|
| group | 否 | 接口分组，如果指定了未配置顺序的分组，会导致接口索引无法索引到该接口 |
| param | 否 | 参数说明，基本按照JSDoc的格式编写，但是不用写明参数类型，对象和数组参数支持```xxx.xxx```和```xxx[]```的注释写法，以便于生成更详细的参数说明 |
| returns | 是 | 返回数据，无论接口是否返回数据都应该编写该标签。若要用一句话描述返回数据时可采用单行模式编写，而要编写具体的返回的数据结构时则应该用多行模式进行编写。在多行模式下，从标签的下一行开始到本注释结束的部分都会以JS脚本引用的形式展示在文档中。假如接口在不同的情况下有不同的返回格式，则应当为每种返回格式编写对应的```returns```标签 |
| description | 是 | 补充说明，其内容将会作为补充说明添加到文档中，你可以在注释里添加任意多个补充说明标签 |
| table | 否 | 操作的数据表，当接口要对某些**重要数据表**进行**重要操作**时，应通过该标签注明。该标签的格式形如```@table 数据库名/表名```，同一个接口可以添加多个```table```标签 |
| todo | 否 | 未完成事项，若接口有尚未完成的事项需要告知使用者时，可以使用该标签，你可以在注释里添加任意多个未完成事项说明 |
| author | 否 | 作者，若需要注明接口的作者，可以使用该标签 |