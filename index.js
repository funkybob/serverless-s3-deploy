'use strict';

const BbPromise = require('bluebird');
const validate = require('serverless/lib/plugins/aws/lib/validate');

const glob = require('glob-all');
const fs = require('fs');
const mime = require('mime-magic');

const globOpts = {
  nodir: true
};

class Assets {
  constructor (serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');

    Object.assign(this, validate)

    this.commands = {
      s3deploy: {
        lifecycleEvents: [
          'serverless'
        ]
      }
    };

    this.hooks = {
      'before:s3deploy:serverless': () => BbPromise.bind(this)
        .then(this.validate),
      's3deploy:serverless': () => BbPromise.bind(this)
        .then(this.deployS3)
    };
  }

  deployS3() {
    const service = this.serverless.service;
    const config = service.custom.assets;

    // glob
    config.files.forEach((opt) => {
      var cfg = Object.assign({cwd: opt.source}, globOpts);
      glob.sync(opt.globs, cfg).forEach((fn) => {

        const body = fs.readFileSync(opt.source + fn)

        mime(opt.source + fn, (err, type) => {
          if (err) throw err;
          console.log("File: ", fn, type)

          this.provider.request('S3', 'putObject', {
            ACL: config.acl || 'public-read',
            Body: body,
            Bucket: config.bucket,
            Key: fn,
            ContentType: type
          }, this.options.stage, this.options.region)

        });

      });
    })

  }
}

module.exports = Assets;
