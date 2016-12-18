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

   $ sls s3delpoy

