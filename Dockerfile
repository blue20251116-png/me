FROM node:22-bookworm-slim

WORKDIR /app

# FFmpeg 패키지에는 ffmpeg와 ffprobe가 함께 포함됩니다.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates python3 make g++ \
    && rm -rf /var/lib/apt/lists/* \
    && ffmpeg -version >/dev/null \
    && ffprobe -version >/dev/null

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production

CMD ["npm", "start"]
