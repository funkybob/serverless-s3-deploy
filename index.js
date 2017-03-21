'use strict';

const glob = require('glob-all');
const fs = require('fs');
const mime = require('mime-types');


const globOpts = {
  nodir: true
};


class Assets {
  constructor (serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');

    this.commands = {
      s3deploy: {
        lifecycleEvents: [
          'deploy'
        ],
        options: {
          verbose: {
            usage: "Increase verbosity",
            shortcut: 'v'
          }
        }
      }
    };

    this.hooks = {
      's3deploy:deploy': () => Promise.resolve().then(this.deployS3.bind(this))
    };
  }

  deployS3() {
    const service = this.serverless.service;
    const config = service.custom.assets;

    // glob
    return new Promise((resolve, reject) => {
      config.files.forEach((opt) => {
        let cfg = Object.assign({}, globOpts, {cwd: opt.source});
        glob.sync(opt.globs, cfg).forEach((fn) => {

          const body = fs.readFileSync(opt.source + fn)
          const type = mime.lookup(fn);

          (!!this.options.verbose) && this.serverless.cli.log("File: ", fn, type)

          this.provider.request('S3', 'putObject', {
            ACL: config.acl || 'public-read',
            Body: body,
            Bucket: config.bucket,
            Key: fn,
            ContentType: type
          }, this.options.stage, this.options.region);

        });
      });
      resolve();
    });
  }
}

module.exports = Assets;
