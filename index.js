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

    let config = this.serverless.service.custom.assets;
    if(Array.isArray(config)) {
      config = {targets: config};
    }

    this.config = Object.assign({}, {
      auto: false,
      targets: [],
      parallel: true,
    }, config);

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
      's3deploy:deploy': () => Promise.resolve().then(this.deployS3.bind(this)),
      'after:deploy:finalize': () => Promise.resolve().then(this.afterDeploy.bind(this))
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

  afterDeploy() {
    if(this.config.auto) {
      this.deployS3();
    }
  }

  processParallel(steps) {
    return Promise.all(steps);
  }

  processSequential(steps) {
    return steps.reduce((a, b) => a.then(b, e => this.log(e)), Promise.resolved())
  }

  deployS3() {
    let assetSets = this.config.targets;
    let parallel = this.config.parallel;

    // turn each Target into a Promise
    let steps = assetSets.map(assets => {
      const bucket = assets.bucket;
      const prefix = assets.prefix || '';
      assets.files.forEach(opt => {
        let logPrefix = `[${bucket}:${prefix}] `;
        this.log(logPrefix + 'Starting');

        let step = Promise.resolved();

        if(this.options.bucket && this.options.bucket !== bucket) {
          this.log(logPrefix + 'Skipping');
          return step;
        }

        this.log(logPrefix + `Path: ${opt.source}`);

        if(assets.clear) {
          this.log(logPrefix + 'Clearing...');
          step = step.then(
            this.provider.request('S3', 'listBucket', {prefix: prefix}, this.options.stage, this.options.region)
          );
        }

        const cfg = Object.assign({}, globOpts, {cwd: opt.source});
        glob.sync(opt.globs, cfg).forEach(filename => {
          step = step.then(() => {

            const body = fs.readFileSync(path.join(opt.source, filename));
            const type = mime.lookup(filename) || opt.defaultContentType || 'application/octet-stream';

            this.log(logPrefix + `${filename} (${type})`);

            const details = Object.assign({
              ACL: assets.acl || 'public-read',
              Body: body,
              Bucket: bucket,
              Key: path.join(prefix, filename),
              ContentType: type
            }, opt.headers || {});

            this.provider.request('S3', 'putObject', details, this.options.stage, this.options.region);

          });

        });

        return step;

      });

    })

    return (parallel) ? this.processParallel(steps) : this.processSequential(steps);

  }
}

module.exports = Assets;
