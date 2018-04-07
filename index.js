'use strict';

const glob = require('glob-all');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const BbPromise = require('bluebird');

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

  listStackResources(resources, nextToken) {
    resources = resources || [];
    return this.provider.request('CloudFormation', 'listStackResources', { StackName: this.provider.naming.getStackName(), NextToken: nextToken })
    .then(response => {
      resources.push.apply(resources, response.StackResourceSummaries);
      if (response.NextToken) {
        // Query next page
        return this.listStackResources(resources, response.NextToken);
      }
    })
    .return(resources);
  }
  
  resolveBucket(resources, value) {
    if (typeof value === 'string') {
      return value;
    }
    else if (value && value.Ref) {
      let resolved;
      resources.forEach(resource => {
        if (resource && resource.LogicalResourceId === value.Ref) {
          resolved = resource.PhysicalResourceId;
        }
      });

      if (!resolved) {
        this.serverless.cli.log(`WARNING: Failed to resolve reference ${value.Ref}`);
      }
      return BbPromise.resolve(resolved);
    }
    else {
      return BbPromise.reject(new Error(`Invalid bucket name ${value}`));
    }
  }

  deployS3() {
    let assetSets = this.config.targets;

    // Read existing stack resources so we can resolve references if necessary
    return this.listStackResources()
    .then(resources => {
      // Process asset sets in parallel (up to 3)
      return BbPromise.map(assetSets, assets => {
        // Try to resolve the bucket name
        return this.resolveBucket(resources, assets.bucket)
        .then(bucket => {
          const prefix = assets.prefix || '';
          // Process files serially to not overload the network
          return BbPromise.each(assets.files, opt => {
            this.log(`Bucket: ${bucket}:${prefix}`);

            if(this.options.bucket && this.options.bucket !== bucket) {
              this.log('Skipping');
              return;
            }

            this.log(`Path: ${opt.source}`);

            const cfg = Object.assign({}, globOpts, {cwd: opt.source});
            glob.sync(opt.globs, cfg).forEach(filename => {

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

              return this.provider.request('S3', 'putObject', details);
            });
          });
        });
      }, { concurrency: 3 });
    });
  }
}

module.exports = Assets;
