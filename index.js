'use strict';

const glob = require('glob-all');
const fs = require('fs');
const path = require('path');
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
        usage: 'Deploy assets to S3 bucket',
        lifecycleEvents: [
          'deploy'
        ],
        options: {
          verbose: {
            usage: 'Increase verbosity',
            shortcut: 'v'
          },
          bucket: {
            usage: 'Limit the deploy to a specific bucket',
            shortcut: 'b'
          }
        }
      }
    };

    this.hooks = {
      's3deploy:deploy': () => Promise.resolve().then(this.deployS3.bind(this))
    };
  }

  /*
   * Handy method for logging (when `verbose` is set)
   */
  log(message) {
    if(this.options.verbose) {
      this.serverless.cli.log(message);
    }
  }

  deployS3() {
    const service = this.serverless.service;
    let assetSets = service.custom.assets;

    if (!Array.isArray(assetSets)) {
      assetSets = [assetSets];
    }

    // glob
    return new Promise((resolve) => {
      assetSets.forEach((assets) => {
        assets.files.forEach((opt) => {
          const bucket = assets.bucket;
          this.log(`Bucket: ${bucket}`);

          if(this.options.bucket && this.options.bucket !== bucket) {
            this.log('Skipping');
            return;
          }

          this.log(`Path: ${opt.source}`);

          const cfg = Object.assign({}, globOpts, {cwd: opt.source});
          glob.sync(opt.globs, cfg).forEach((filename) => {

            const body = fs.readFileSync(path.join(opt.source, filename));
            const type = mime.lookup(filename) || opt.defaultContentType || 'application/octet-stream';

            this.log(`\tFile:  ${filename} (${type})`);

            this.provider.request('S3', 'putObject', {
              ACL: assets.acl || 'public-read',
              Body: body,
              Bucket: bucket,
              Key: filename,
              ContentType: type
            }, this.options.stage, this.options.region);
          });
        });
      });
      resolve();
    });
  }
}

module.exports = Assets;
