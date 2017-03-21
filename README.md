# serverless-s3-deploy

Plugin for serverless to deploy files to a S3 Bucket

# Usage

Add to your serverless.yml:
    plugins:
      - serverless-s3-deploy

    custom:
      assets:
        bucket: my-bucket
        files:
          - source: ../assets/
            globs: **/*.css
          - source: ../app/
            globs:
              - **/*.js
              - **/*.map

You can specify `source` relative to the current directory.

Each `source` has its own list of `globs`, which can be either a single glob,
or a list of globs.

Now you can upload all of these assets to your bucket by running:

```
$ sls s3delpoy
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
