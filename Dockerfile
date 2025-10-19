FROM node:22-alpine

RUN apk add --no-cache git

WORKDIR /app

RUN git clone https://github.com/QuixThe2nd/metadatarr .
RUN git clone https://github.com/QuixThe2nd/parse-torrent-title ../parse-torrent-title

RUN npm install

VOLUME ["/app/store/config"]

EXPOSE 9191

CMD ["npx", "tsx", "src/index.ts"]