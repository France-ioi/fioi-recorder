
# Try it

The most recent production version can be used
[here](https://codecast.france-ioi.org/v5/).

The development version can be tried
[here](https://codecast.france-ioi.org/next/).
This version can break compatibility with past production releases, that
is, there is no expectation that recordings made on the development
version will remain readable.

# Quick start

Build `c-to-json` and copy the executable at the root of this project.

Copy `config.json.template` to `config.json` and edit it.

If not using oauth2, remove keys "database", "session" and "auth" and
fill in settings in "configs" and "tokens".

If using oauth2, fill in settings in "database", "session" and "auth",
and remove keys "configs" and "tokens".  Use oauth2_schema.sql, and
add rows in user_configs where value is a json object with keys
"s3AccessKeyId", "s3SecretAccessKey", "s3Region", "s3Bucket", and
"uploadPath".  The row with user_id 0 is used for guest settings.


1. setup codecast-examples project and proxy it
check: search backend/server.js for "app.use('/examples/**'", replace the ip with examples server ip, also install a cors plugin in your browser to get rid of cors issues..

2. when login in for the first time in development, check the console log for the user_id, which you need to add the db row for the user, that's meantioned above

3. for uploading your own codecasts for your dev setup, use "/dev-upload" url, add in backend/server.js, instructions are in there

Start with these commands:

    npm install
    npm run build
    npm start

For development "npm run build" is not needed as webpack is configured
to watch the source files:

    NODE_ENV=development npm start

# Build for offline use

    rm -rf build
    BUILD=offline NODE_ENV=production npm run build
    zip -r offline.zip build assets
