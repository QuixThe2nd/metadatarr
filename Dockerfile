FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache git
ARG CACHEBUST=1
RUN git clone https://git.yazdani.au/Parsa/parse-torrent-title.git || \
   git clone https://github.com/QuixThe2nd/parse-torrent-title.git
ARG CACHEBUST=1
RUN git clone https://git.yazdani.au/Parsa/metadatarr.git || \
   git clone https://github.com/QuixThe2nd/metadatarr.git

WORKDIR /app/metadatarr
RUN npm install

CMD ["npx", "tsx", "src"]
