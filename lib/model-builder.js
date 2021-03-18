'use strict';

const _ = require('lodash');
const path = require('path');
const generator = require('egg-sequelize-mg');
const ShowDocApi = require('node-showdoc');
const LoggerCollector = require('./logger-collector');

const onlyTest = (process.argv.indexOf('--onlyTest') >= 0 || process.argv.indexOf('--only-test') >= 0); // 判断是否仅做测试，不实际上传数据到showdoc服务器

// 数据模型构造器
class ModelBuilder {
  constructor(app, config, indexName = '索引') {
    if (!app) throw new Error('缺少有效的app实例');
    if (!config.dbConfig) throw new Error('必须配置dbConfig相关数据');

    this.app = app;
    this.config = config;
    this.indexName = indexName;

    if (!onlyTest && config.showdoc) {
      this.showdoc = new ShowDocApi(config.showdoc);
    }
    this.logger = new LoggerCollector();
  }

  // 构造数据模型，可选择是否同时构造文档
  async genDatabaseModels(buildDoc = false) {
    const docJson = buildDoc ? {} : null;
    this.logger.clear();

    await generator.generate(this.app.config.sequelize,
      this.config.tables,
      path.join(this.app.baseDir, 'app'),
      generator.sachikawaMysql(docJson));
    if (buildDoc) {
      await this.updateDBDocs(docJson);
    }

    this.logger.output();
  }

  // 构造所有文档并更新到服务器
  async updateDBDocs(dbJson) {
    const cfg = this.config.dbConfig;
    if (!dbJson.comments)dbJson.comments = {};

    for (const key in dbJson.databases) {
      if (cfg[key]) {
        await this.buildDbDoc(dbJson.comments[key], dbJson.databases[key], cfg[key]);
      }
    }
  }

  // 构造单个数据库的全部文档
  async buildDbDoc(comments, dbJson, config) {
    comments = comments || {};
    const dirPath = config.path;

    const groupTexts = {}; // 索引对象

    let counter = 0; // 计数器，用于确定文档排序
    for (const table in dbJson) {
      const commentList = _.filter(comments, obj => obj.tableName === table);
      const { group, desc, url } = await this.buildTableDoc(table, dbJson[table], commentList, counter, dirPath);
      counter++;
      console.log('updated doc:' + dirPath + '/' + table);
      if (groupTexts[group]) {
        groupTexts[group].push({ table, desc, url });
      } else {
        groupTexts[group] = [{ table, desc, url }];
      }
    }

    await this.buildIndexDoc(groupTexts, config.groups, dirPath);
    console.log('updated doc:' + dirPath + '/' + this.indexName);
  }

  // 构造单个数据表的文档
  async buildTableDoc(name, table, comments, counter, dirPath) {
    // 构造字段说明
    if (!table.comment || table.comment === '' || table.comment === ' No comment for this table') {
      this.logger.error(`* 数据表[${name}]缺少注释，请立即补充注释`);
    }
    let text = `-  ${table.comment}\n\n## 字段说明 \n\n|字段|类型|允许为空|默认值|注释|\n|:---|:---|:---|---|---|\n`;
    for (const fieldName in table.columns) {
      const { type, allowNull, defaultValue, autoIncrement, comment } = table.columns[fieldName];
      if (!comment || comment === '') {
        this.logger.error(`* 字段[${name}.${fieldName}]缺少注释，请立即补充注释`);
      }
      text += `|${fieldName}|${type}|${allowNull ? '是' : '否'}|${autoIncrement ? '自增字段' : defaultValue || ''}|${comment}|\n`;
    }
    text += '\n';

    // 构造字段补充说明
    for (const comment of comments) {
      text += `#### 字段详解：${comment.columnName}\n${comment.desc}\n`;
    }
    if (comments.length > 0)text += '\n';

    // 构造索引说明
    text += '## 数据索引\n\n';
    for (const key in table.keys) {
      const curKey = table.keys[key];
      const keyText = curKey.keys.join(',');
      if (key === 'PRIMARY') {
        text += `- 主键：${keyText}\n`;
      } else {
        text += `- ${curKey.unique ? '唯一索引 ' : '普通索引 '}${key}:${keyText}\n`;
      }
    }

    // 提交数据到服务器
    const url = await this.saveDoc(dirPath, name, text, counter + 2);

    return {
      group: table.group || '其他',
      desc: table.comment,
      url,
    };
  }

  // 构造数据库索引文档
  async buildIndexDoc(groupTexts, groups, dirPath) {
    let text = '';
    for (const group of groups) {
      const groupInfo = groupTexts[group];
      if (!groupInfo || groupInfo.length === 0) continue;

      text += `### ${group}\n\n|表名|注释|\n|:---|------|\n`;
      _.sortBy(groupInfo, 'table');

      for (const table of groupInfo) {
        text += `| [${table.table}](${table.url}) | ${table.desc} |\n`;
      }
      text += '\n';
    }

    // 找出非标准分组
    for (const name in groupTexts) {
      if (!groups.includes(name)) {
        this.logger.warning(`* 未索引的分组[${name}]:${_.map(groupTexts[name], 'table').join(',')}`);
      }
    }

    await this.saveDoc(dirPath, this.indexName, text, 1);
  }

  // 保存文档
  async saveDoc(dirPath, fileName, content, order) {
    if (!this.showdoc) return 'invaild url';
    return await this.showdoc.updateDoc(dirPath, fileName, content, order);
  }
}

module.exports = ModelBuilder;
