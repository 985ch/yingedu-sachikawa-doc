'use strict';

const _ = require('lodash');
const path = require('path');
const ShowDocApi = require('node-showdoc');
const LoggerCollector = require('./logger-collector');
const CommentReader = require('./comment-reader');

const onlyTest = (process.argv.indexOf('--onlyTest') >= 0 || process.argv.indexOf('--only-test') >= 0); // 判断是否仅做测试，不实际上传数据到showdoc服务器

// API文档构造器
class ApiDocBuilder {
  constructor(app, config, readerClass) {
    if (!app) throw new Error('缺少有效的app实例');
    if (!config.apiConfig) throw new Error('必须配置apiConfig相关数据');

    this.app = app;
    this.config = config;
    this.httpPath = path.join(app.baseDir, 'app', app.config.routerFactory.routerPath);

    if (!onlyTest && config.showdoc) {
      this.showdoc = new ShowDocApi(config.showdoc);
    }
    this.logger = new LoggerCollector();
    if (readerClass) {
      this.commentReader = new readerClass(this.logger);
    } else {
      this.commentReader = new CommentReader(this.logger);
    }
  }

  // 构建接口文档
  async buildDoc() {
    const routers = this.app.routerFactory.routers;
    const { groups, indexDocPath, indexFileName } = this.config.apiConfig;
    this.logger.clear();

    // 生成接口文档
    const apis = {};
    for (let i = 0; i < routers.length; i++) {
      const obj = routers[i];

      const apiInfo = await this.buildApiDoc(obj, i);
      if (!apiInfo) continue;

      if (apis[apiInfo.group]) {
        apis[apiInfo.group].push(apiInfo);
      } else {
        apis[apiInfo.group] = [ apiInfo ];
      }

      console.log('updated api document:' + obj.path);
    }

    // 生成索引文档
    let text = '';
    const textCounter = {}; // 用于记录有没有注释重复的接口
    for (const name of groups) {
      const apiList = apis[name];
      if (!apiList) continue;

      text += `### ${name}\n\n| 接口 | 注释 |\n|:---|:---|\n`;
      _.sortBy(apiList, 'api'); // 重新排序
      for (const api of apiList) {
        text += `| ${this.getLinkText(api.url, api.api)} | ${api.desc} |\n`;
        if (!api.desc || api.desc === '') continue;

        if (textCounter[api.desc]) {
          textCounter[api.desc].push(api.api);
        } else {
          textCounter[api.desc] = [ api.api ];
        }
      }
      text += '\n';
    }
    await this.saveDoc(indexDocPath, indexFileName, text, 1);
    console.log('updated api document:' + indexFileName);

    // 找出非标准分组
    for (const name in apis) {
      if (!groups.includes(name)) {
        this.logger.warning(`* 未索引的分组[${name}]:${_.map(apis[name], 'api').join(',')}`);
      }
    }
    // 找出重复注释的接口
    for (const key in textCounter) {
      if (textCounter[key].length > 1) {
        this.logger.error('* 以下接口的注释重复，请核对是否正确编写接口注释：' + textCounter[key].join(','));
      }
    }

    // 输出日志
    this.logger.output();
  }

  // 根据接口对象构建单个接口文档
  async buildApiDoc(obj, counter) {
    const { docPath } = this.config.apiConfig;
    const { key } = obj;
    const api = obj.path;

    // 读取源脚本得到注释对象
    const fileName = key + (key[key.length - 1] === '/' ? 'index.js' : '.js');
    const comment = await this.readComment(path.join(this.httpPath, fileName));
    if (!comment) {
      console.log(comment);
      this.logger.error(`* 接口脚本缺乏必要注释：${fileName}`);
      return;
    }
    // 生成文档
    const buildInfo = await this.getBuildInfo(fileName);
    const docText = comment.desc + '\n\n' +
    this.getBaseText(obj, comment, buildInfo) +
    this.getParamsText(obj, comment, buildInfo) +
    this.getReturnsText(obj, comment, buildInfo) +
    this.getEtcText(obj, comment, buildInfo) +
    this.getTablesText(obj, comment, buildInfo) +
    this.getTodoText(obj, comment, buildInfo);

    // 写入文档
    const url = await this.saveDoc(docPath, api, docText, counter + 2);
    // 填写索引数据
    const group = comment.group || '其他';
    return {
      api,
      group,
      desc: comment.desc,
      url,
    };
  }

  // 根据接口对象和注释对象获取构建情报
  async getBuildInfo(fileName) {
    let pages = {};
    if (this.showdoc) {
      pages = await this.showdoc.getPages();
    }
    return { fileName, pages };
  }

  // 读取注释的方法
  readComment(file) {
    return this.commentReader.readComment(file);
  }

  // 获取基本信息文本
  getBaseText(obj, { author }) {
    const { method, item } = obj;
    const { ip, cache } = item;

    // 拼接完整简介文本
    return '## 基本信息\n\n' +
      '* 接口：【' + method + '】' + obj.path + '\n' +
      '* IP限制：' + (ip ? '有限制' : '无限制') + '\n' +
      '* 接口缓存：' + (cache ? '启用' : '未启用') + '\n' +
      (author ? '* 接口作者：' + author : '') +
      '\n';
  }

  // 根据路由对象和注释获取参数信息
  getParamsText(routerObj, commentObj, buildInfo) {
    const { item } = routerObj;
    const paramsComment = commentObj.params;
    const { specialParamNames } = this.config.apiConfig;
    const { fileName } = buildInfo;

    const textHead = '## 参数\n\n| 参数 | 类型 | 是否可选 | 默认值 | 说明 |\n|:-----|:----|:--------|:-------|:-----|\n';
    let text = '';
    let appendText = '';

    // 获取特殊参数文本
    text = this.getSpParamText(routerObj, paramsComment, buildInfo);

    // 处理一般参数
    const params = item.params || {};
    for (const key in params) {
      if (specialParamNames.includes(key)) {
        this.logger.warning(`- 接口配置了和特殊参数同名的参数(${key})：${fileName}`);
      }
      const param = params[key];
      const comment = paramsComment[key] || {};

      let type = param.type || param;
      if (_.isObject(type)) {
        const paramInfo = this.getParamInfo(key, param, comment);
        appendText += paramInfo.appendText;
        type = paramInfo.type;
      } else {
        if (type === 'array') {
          type = '[]any';
          this.logger.warning(`- 数组类型参数缺少成员类型说明(${key}):${fileName}`);
        }
      }

      const required = (param.optional || !_.isUndefined(param.default)) ? '可选' : '必填';
      const defaultVal = _.isUndefined(param.default) ? '-' : JSON.stringify(params.default);
      const desc = comment.desc || '该参数缺少注释，请联系开发者补充';
      if (!comment.desc) {
        this.logger.warning(`- 接口参数缺少注释(${key}):${fileName}`);
      }

      text += `| ${key} | ${type} | ${required} | ${defaultVal} | ${desc} |\n`;
    }

    if (text === '') return text;
    return textHead + text + '\n' + appendText;
  }

  // 获取特殊参数文本
  getSpParamText() {
    return '';
  }

  // 获取对象或数组的额外参数信息
  getParamInfo(name, param, comment) {
    let text = '';
    let appendText = '';
    let type = param.type;
    if (param.type === 'array') {
      if (param.items) {
        const arrType = param.items.type;
        type = arrType;
        if (arrType === 'array' || arrType === 'object') {
          const appendInfo = this.getParamInfo(name, param.items, comment);
          appendText += appendInfo.appendText;
          type = appendInfo.type;
        }
      } else {
        type = 'any';
      }
      type = '[]' + type;
    } else if (param.type === 'object' && param.properties) {
      text = '#### ' + name + '对象详解\n\n| 属性 | 类型 | 说明 | \n|:----|:-----|:-----|\n';
      const subComments = comment.params || {};
      for (const key in param.properties) {
        const prop = param.properties[key];
        let propType = prop.type;
        const curComment = subComments[key] || {};
        if (propType === 'array' || propType === 'object') {
          const appendInfo = this.getParamInfo(name + '.' + key, prop, curComment);
          appendText += appendInfo.appendText;
          if (propType === 'array') {
            propType = '[]' + appendInfo.type;
          }
        }
        text += `| ${key} | ${propType} | ${subComments[key] && curComment.desc || '该参数缺少注释'} |\n`;
      }
      text += '\n';
    }

    return { type, appendText: text + appendText };
  }

  // 根据注释对象获取返回信息
  getReturnsText(routerObj, { returns }, { fileName }) {
    let text = '## 返回结果\n\n';
    if (returns.length === 0) {
      this.logger.error(`* 接口没有对返回数据进行说明：${fileName}`);
      text += '缺少返回注释，请通知开发者补上\n';
    } else if (returns.length === 1 && returns[0].desc.indexOf('\n') === 0) {
      text += returns[0].desc + '\n';
    } else {
      for (const ret of returns) {
        text += ret.name ? `### ${ret.name}\n` : '';
        if (ret.desc.indexOf('\n') > 0) {
          text += '```js\n' + ret.desc + '```\n\n';
        } else {
          text += ret.desc + '\n\n';
        }
      }
    }
    return text + '\n';
  }

  // 根据注释对象获取额外信息文本
  getEtcText(routerObj, { etcs }) {
    if (etcs.length === 0) return '';

    let text = '## 补充说明\n\n';
    for (const etc of etcs) {
      text += '* ' + etc + '\n';
    }
    return text + '\n';
  }

  // 根据注释对象和文档索引获取表格文本
  getTablesText(routerObj, { tables }, { fileName, pages }) {
    if (tables.length === 0) return '';

    let text = '## 操作的数据表\n\n';
    for (const table of tables) {
      const tableInfo = table.split('/');
      if (tableInfo.length !== 2) {
        this.logger.warning(`* 错误的数据表注释(${table})：${fileName}`);
      } else {
        const dbPath = _.get(this.config.dbConfig, [ tableInfo[0], 'path' ], null);
        if (dbPath && pages[dbPath + '/' + tableInfo[1]]) {
          text += `* ${this.getLinkText(pages[dbPath + '/' + tableInfo[1]], table)}\n`;
        } else {
          text += `* ${table}\n`;
        }
      }
    }
    text += '\n';
    return text;
  }

  // 根据注释对象获取未完成对象文本
  getTodoText(routeObj, { todos }) {
    if (todos.length === 0) return '';

    let text = '## 未完成事项\n\n';
    for (const todo of todos) {
      text += '* ' + todo + '\n';
    }
    return text + '\n';
  }

  // 保存文档
  async saveDoc(dirPath, fileName, content, order) {
    if (!this.showdoc) return 'invaild url';
    return await this.showdoc.updateDoc(dirPath, fileName, content, order);
  }

  // 生成链接文本
  getLinkText(url, text) {
    if (this.config.getLinkText) {
      return this.config.getLinkText(url, text);
    }
    return `[${text || url}](${url})`;
  }
}

module.exports = ApiDocBuilder;
