FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache git
RUN git clone https://github.com/QuixThe2nd/parse-torrent-title.git
RUN git clone https://github.com/QuixThe2nd/metadatarr.git

WORKDIR /app/metadatarr
RUN npm install

CMD ["npx", "tsx", "src"]
