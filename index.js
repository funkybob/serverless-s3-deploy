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
      verbose: false,
      resolveReferences: true,
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
   * Also log on the default serverless SLS_DEBUG env
   */
  log(message) {
    if(this.options.verbose || process.env.SLS_DEBUG || this.config.verbose) {
      this.serverless.cli.log(message);
    }
  }

  afterDeploy() {
    if(this.config.auto) {
      return this.deployS3();
    }
  }

  listStackResources(resources, nextToken) {
    resources = resources || [];
    if (!this.config.resolveReferences) {
      return BbPromise.resolve(resources);
    }
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
      return BbPromise.resolve(value);
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

  emptyBucket(bucket, dir) {
    const listParams = {
      Bucket: bucket,
      Prefix: dir
    };

    return this.provider.request('S3', 'listObjectsV2', listParams)
      .then((listedObjects) => {
        if (listedObjects.Contents.length === 0) return;

        const deleteParams = {
          Bucket: bucket,
          Delete: { Objects: [] }
        };

        listedObjects.Contents.forEach(({ Key }) => {
          deleteParams.Delete.Objects.push({ Key });
        });
        return this.provider.request('S3', 'deleteObjects', deleteParams)
          .then(() => {
            if (listedObjects.Contents.IsTruncated) {
              this.log('Is not finished. Rerun emptyBucket');
              return this.emptyBucket(bucket, dir);
            }
          });
      });
  }

  deployS3() {
    let assetSets = this.config.targets;

    // Read existing stack resources so we can resolve references if necessary
    return this.listStackResources()
      .then(resources => {
      // Process asset sets in parallel (up to 3)
        return BbPromise.map(assetSets, assets => {
          const prefix = assets.prefix || '';
          // Try to resolve the bucket name
          return this.resolveBucket(resources, assets.bucket)
            .then((bucket) => {
              if (this.options.bucket && this.options.bucket !== bucket) {
                this.log(`Skipping bucket: ${bucket}`);
                return Promise.resolve('');
              }

              if(assets.empty) {
                this.log(`Emptying bucket: ${bucket}`);
                return this.emptyBucket(bucket, prefix)
                  .then(() => bucket);
              }
              return Promise.resolve(bucket);
            }).then(bucket => {
              if (!bucket) {
                return;
              }

              // Process files serially to not overload the network
              return BbPromise.each(assets.files, (opt) => {
                this.log(`Sync bucket: ${bucket}:${prefix}`);
                this.log(`Path: ${opt.source}`);

                const cfg = Object.assign({}, globOpts, { cwd: opt.source });
                const filenames = glob.sync(opt.globs, cfg);
                return BbPromise.each(filenames, (filename) => {
                  const body = fs.readFileSync(path.join(opt.source, filename));
                  const type = mime.lookup(filename) || opt.defaultContentType || 'application/octet-stream';

                  this.log(`\tFile:  ${filename} (${type})`);

                  // when using windows path join resolves to backslashes, but s3 is expecting a slash
                  // therefore replace all backslashes with slashes
                  const key = path
                    .join(prefix, filename)
                    .replace(/\\/g, '/');

                  const details = Object.assign(
                    {
                      ACL: assets.acl || 'private',
                      Body: body,
                      Bucket: bucket,
                      Key: key,
                      ContentType: type
                    },
                    opt.headers || {}
                  );

                  return this.provider.request('S3', 'putObject', details);
                });
              });
            });
        },
        { concurrency: 3 }
        );
      });
  }
}

module.exports = Assets;
