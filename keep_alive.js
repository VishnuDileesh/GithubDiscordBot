import http from 'http'

http
  .createServer(function (req, res) {
    res.write("I'm alive on 8080")
    res.end()
  })
  .listen(8080)
