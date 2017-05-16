# serverless-s3-deploy

Plugin for serverless to deploy files to a variety of S3 Buckets

# Usage

Add to your serverless.yml:

```
  plugins:
    - serverless-s3-deploy

  custom:
    assets:
      targets:
       - bucket: my-bucket
         files:
          - source: ../assets/
            globs: '**/*.css'
          - source: ../app/
            globs:
              - '**/*.js'
              - '**/*.map'
       - bucket: my-other-bucket
         prefix: /subdir'
         files:
          - source: ../email-templates/
            globs: '**/*.html'
```

You can specify any number of `target`s that you want. Each `target` has a
`bucket` and a `prefix`.

You can specify `source` relative to the current directory.

Each `source` has its own list of `globs`, which can be either a single glob,
or a list of globs.

Now you can upload all of these assets to your bucket by running:

```
$ sls s3delpoy
```

If you have defined multiple buckets, you can limit your deployment to
a single bucket with the `--bucket` option:

```
$ sls s3deploy --bucket my-bucket
```

## ACL

You can optionally specific an ACL for the files uploaded on a per target basis:

```
  custom:
    assets:
      targets:
        - bucket: my-bucket
          acl: private
          files:
```

The default value is `public-read`.  Options are defined [here](http://docs.aws.amazon.com/AmazonS3/latest/dev/acl-overview.html#canned-acl).

## Content Type

The appropriate Content Type for each file will attempt to be determined using ``mime-types``.  If one can't be determined, a default fallback of 'application/octet-stream' will be used.

You can override this fallback per-source by setting ``defaultContentType``.

```
  custom:
    assets:
      targets:
        - bucket: my-bucket
          files:
            - source: html/
              defaultContentType: text/html
              ...
```

## Auto-deploy

If you want s3deploy to run automatically after a deploy, set the `auto` flag:

```
  custom:
    assets:
      auto: true
```

## IAM Configuration

You're going to need an IAM policy that supports this deployment. This might be
a good starting point:

```
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:ListBucket"
            ],
            "Resource": [
                "arn:aws:s3:::${bucket}"
            ]
        },
        {
            "Effect": "Allow",
            "Action": [
                "s3:PutObject",
                "s3:PutObjectAcl",
                "s3:GetObject",
                "s3:DeleteObject"
            ],
            "Resource": [
                "arn:aws:s3:::${bucket}/*"
            ]
        }
    ]
}
```
