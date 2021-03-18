// js注释读取模块
'use strict';

const fs = require('fs');
const { parse } = require('comment-parser/lib');

class CommentReader {
  constructor(logger) {
    this.logger = logger;
  }

  // 读取js脚本获得注释对象
  readComment(fullPath) {
    const jsRaw = fs.readFileSync(fullPath, 'utf-8');
    const rawComments = parse(jsRaw, { spacing: 'preserve' });

    const raw = rawComments[0];
    if (!raw) return null;
    const { description, tags } = raw;

    // 生成基本对象
    const commentJson = {
      author: null,
      desc: description,
      group: null,
      params: {},
      returns: [],
      tables: [],
      etcs: [],
      todos: [],
    };
    // 从标签中获取参数，返回，表格和补充说明

    for (const tag of tags) {
      this.readTagData(fullPath, tag, commentJson);
    }

    return commentJson;
  }

  // 从注释的标签中获取注释内容
  readTagData(fullPath, tag, commentJson) {
    switch (tag.tag) {
      case 'author':
        commentJson.author = tag.name === '' ? tag.description : tag.name;
        break;
      case 'param':
        this.pushParams(fullPath, tag, commentJson);
        break;
      case 'returns':
        this.pushReturns(tag, commentJson);
        break;
      case 'group':
        commentJson.group = tag.name;
        break;
      case 'description':
        commentJson.etcs.push(tag.description);
        break;
      case 'table':
      case 'todo':
        {
          let desc = tag.description === '' ? tag.name : tag.description;
          if (desc[0] === '\n')desc = desc.substring(1);
          commentJson[tag.tag + 's'].push(desc);
        }
        break;
      default:
        break;
    }
  }

  // 根据标签填充参数对象
  pushParams(fullPath, { name, description }, { params }) {
  // 处理数组类参数的补充说明
    const flagA = name.indexOf('[]');
    const flagO = name.indexOf('.');
    if (flagA > 0 && (flagO === -1 || flagO > flagA)) {
      const mainName = name.substring(0, flagA);
      let subName = name.substring(flagA + 2);
      if (subName === '') { // 处理类似“sth[]”的格式
        name = mainName;
      } else if (subName[0] === '.') { // 处理类似“sth[].sth”的格式
        subName = name.substring(flagA + 3);
        const target = params[mainName] || {};
        if (!target.params)target.params = {};
        this.pushParams(fullPath, { name: subName, description }, target);
        return;
      } else { // 非法格式
        this.logger.warning(`存在不符合规范的注释(${name}):${fullPath}`);
        return;
      }
    }
    // 处理对象类参数的补充说明
    if (flagO > 0) {
      const mainName = name.substring(0, flagO);
      const subName = name.substring(flagO + 1);
      if (subName === '') {
        this.logger.warning(`存在不符合规范的注释(${name}):${fullPath}`);
        return;
      }
      const target = params[mainName] || {};
      if (!target.params)target.params = {};
      this.pushParams(fullPath, { name: subName, description }, target);
      return;

    }
    // 处理普通参数
    if (params[name] && params[name].desc) {
      this.logger.warning(`参数存在多个注释(${name}):${fullPath}`);
    }
    params[name] = { desc: description };
  }

  // 根据标签填充返回结果对象
  pushReturns({ name, description }, { returns }) {
    if (description[0] === '\n') {
      description = description.substring(1);
    }
    if (description === '') {
      returns.push({ name: '', desc: name });
    } else {
      returns.push({ name, desc: description });
    }
  }
}

module.exports = CommentReader;
