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

  /**
   * Creates promise that resolves then all promises returned by
   * promiseFactories resolve.
   *
   * @param {Array.<function(): Promise.<*>>} promiseFactories
   * @return {Promise<Array.<*>>}
   */
  promiseParallel(promiseFactories) {
    return Promise.all(
      promiseFactories.map(factory => Promise.resolve(factory()))
    );
  }

  deployS3() {
    let assetSets = this.config.targets;

    return this.promiseParallel(assetSets.map(assets => {
      const bucket = assets.bucket;
      const prefix = assets.prefix || '';

      return () => {
        this.log(`Bucket: ${bucket}:${prefix}`);

        return this.promiseParallel(assets.files.map(opt => {
          if(this.options.bucket && this.options.bucket !== bucket) {
            this.log('Skipping');
            return;
          }

          this.log(`Path: ${opt.source}`);

          const cfg = Object.assign({}, globOpts, {cwd: opt.source});

          return () => this.promiseParallel(glob.sync(opt.globs, cfg).map(filename => {
            const body = fs.readFileSync(path.join(opt.source, filename));
            const type = mime.lookup(filename) || opt.defaultContentType || 'application/octet-stream';

            this.log(`\tFile:  ${filename} (${type})`);

            const details = Object.assign({
              ACL: assets.acl || 'public-read',
              Body: body,
              Bucket: bucket,
              Key: path.join(prefix, filename),
              ContentType: type
            }, opt.headers || {});

            return () => this
              .provider
              .request('S3', 'putObject', details, this.options.stage, this.options.region)
              .then(() => {
                this.log(`\tDONE: ${ filename } (${type})`);
              });
          }, []));
        }, []));
      };
    }, []));
  }
}

module.exports = Assets;
