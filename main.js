const fs = require('fs-extra')
const async = require('async')
const request = require('request-promise')
const scrapeIt = require('scrape-it')
const download = require('image-downloader')
let mainRepo = 'https://github.com/mibook/gr'
let branchToCompare = 'gh-pages'
const memberUrl = mainRepo + '/network/members'

const forkMemberList = {
  members: {
    listItem: '.repo',
    data: {
      name: {
        selector: 'a:nth-child(3)'
      }
    }
  }
}

// mainProgram()
// testFunction()
parseDiffs()

function testFunction () {
  let testUrl = 'https://raw.githubusercontent.com/anthikape/gr/gh-pages/images/Smalltalk.png'
  // request(testUrl)
  //   .then(res => {
  //     // console.log(res.body)
  //     // console.log(res.request.uri.href)
  //     return fs.writeFile('Smalltalk.png', res)
  //   })
  //   .catch(error => console.log(error))
  // const download = require('image-downloader')

  // Download to a directory and save with the original filename

  downloadImage(testUrl)
    .then(({ filename, image }) => {
      console.log('File saved to', filename)
    })
    .catch((err) => {
      console.error(err)
    })
}

function mainProgram () {
  fs.mkdirp('diffs')
    .then(() => {
      return request(memberUrl)
    })
    .then(res => {
      // scrape & ommit first result because it is a reference to main repo
      let members = scrapeIt.scrapeHTML(res, forkMemberList).members
      members.splice(0, 1)
      if (members.length === 0) throw new Error('No forks found!')
      console.log(`Found ${members.length} forks.`)
      let forkedRepos = members.map(member => {
        return {
          name: member.name,
          url: `${mainRepo}/compare/${branchToCompare}...${member.name}:${branchToCompare}.diff`
        }
      })
      return scrapeWithConcurrency(forkedRepos, 3)
    })
    .then(() => console.log('All done!'))
    .catch(error => console.log(error))
}

function scrapeWithConcurrency (pagesToScrape, pagesConcurrency) {
  let pagesScraped = 0
  let totalPages = pagesToScrape.length
  return new Promise((resolve, reject) => {
    let q = async.queue(function (pageToScrape, callback) {
      request(pageToScrape.url)
        .then(srapedPage => {
          console.log(++pagesScraped + '/' + totalPages)
          return fs.writeFile('diffs' + '/' + pageToScrape.name, srapedPage)
        })
        .then(() => {
          if (pagesToScrape.length === 0) return
          if (pagesToScrape.length) {
            q.push(pagesToScrape.splice(0, 1), function (err) {
              if (err) console.log(`q.push: ${err}`)
            })
          }
        })
        .then(() => {
          callback()
        })
        .catch(error => reject(error))
    }, pagesConcurrency)
    /* KickStart Scraping with first pagesConcurrency pages */
    q.push(pagesToScrape.splice(0, pagesConcurrency), function (err) {
      if (err) console.log(`q.push: ${err}`)
    })

    q.drain = function () {
      if (pagesToScrape.length) {
        return q.push(pagesToScrape.splice(0, pagesConcurrency), function (err) {
          if (err) console.log(`q.push: ${err}`)
        })
      }
      resolve()
    }
  })
}

function parseDiffs () {
  let arrayOfDiffs = []
  fs.mkdirp('output/images')
    .then(() => {
      return fs.readdir('diffs')
    })
    .then(files => {
      let arrayOfPromises = []
      files.forEach(file => {
        let user = { name: file, additions: [] }
        let content = fs.readFileSync('diffs/' + file, 'UTF8')
        content = content.split('\n')
        let imageFound, captionFound, titleFound
        let counter = -1
        function newAddition () {
          imageFound = false
          captionFound = false
          titleFound = false
          counter++
          user.additions[counter] = {}
        }
        newAddition()
        for (let i = 0; i < content.length; i++) {
          line = content[i]
          if (line.slice(0, 11) === '+image_url:') {
            if (imageFound) newAddition()
            imageFound = true
            // console.log('new image: ' + 'https://raw.githubusercontent.com/' + file + '/gr/' + branchToCompare + line.slice(12))
            user.additions[counter].img = 'https://raw.githubusercontent.com/' + file + '/gr/' + branchToCompare + line.slice(12)
            // arrayOfPromises.push(downloadImage(user.additions[counter].img))
          }
          if (line.slice(0, 7) === '+title:') {
            if (titleFound) newAddition()
            titleFound = true
            // console.log('title: ' + line.slice(8))
            user.additions[counter].title = line.slice(8)
          }
          if (line.slice(0, 9) === '+caption:') {
            if (captionFound) newAddition()
            captionFound = true
            // console.log('caption: ' + line.slice(10))
            user.additions[counter].caption = line.slice(10)
          }
        }
        arrayOfDiffs.push(user)
      })
      fs.writeFileSync('output/index.html', createSimpleVueFile(JSON.stringify(arrayOfDiffs)))
      return Promise.all(arrayOfPromises)
    })
    .then(() => console.log('Finished Ok!'))
    .catch(error => console.log(error))
}

function createSimpleVueFile (forks) {
  return `
<!DOCTYPE html>
<html>

<head>
  <title>All forks</title>
  <script src="https://unpkg.com/vue"></script>
  <style>
    img {
      width: 400px;
    }
  </style>
</head>

<body>
  <div id="app">
    <h1>${mainRepo}: All forks</h1>
    <div v-for="fork in forks">
      <hr>
      <h2>{{fork.name}}</h3>
      <div v-for="addition in fork.additions">
        <h5>{{addition.title}}</h5>
        <figure>
          <img :src="addition.img" alt="">
          <figcaption>{{addition.caption}}</figcaption>
        </figure>
      </div>
    </div>
  </div>

  <script>
    var app = new Vue({
      el: '#app',
      data: {
        forks: ${forks}
      }
    })
  </script>
</body>

</html>
`
}

function downloadImage (url) {
  const options = {
    url,
    dest: 'output/images/'                  // Save to /path/to/dest/image.jpg
  }
  return download.image(options)
}