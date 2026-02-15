- use actual grammar in parser, add all keywords and punctuation instead of only some, and refactor some code in it. 
   merge tokens, dont shit objects.
- parser: floats
- latexmk gives error exit code 12 if file not changed
---
- unify blobs into one
- qr code sharing
- touch friendly
- aria labels
- window notification when compilation finished
- indent on enter
- clear output button
- dark/light mode switch
- extract components (editor)
- add statusline
- highlight current line in editor
- autopairs
- loading animation on send
- upload files
- multiple files
- copy link: $origin/?code=blah&i=tex&o=pdf&position=20:5
- response should be: 
    * `{"status": "ok", "elapsed": "2.716s", "data-url": "/data/{file-uuid}"}` (copy to user folder, see next point)
    * `{"status": "err", "exitCode": "1", "errors": [{"position": "input.asy:20:5", "error": "no type of name 'x'"}]}`
- "publish" button, public album of cool pictures. copied and stored in filesystem ASY_USER_DIRS=/app/data/userdata, .../{user_id}/5.input.asy
- publish docker images (and whadabout .env)
- unit/integration tests

