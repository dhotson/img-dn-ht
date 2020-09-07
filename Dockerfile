FROM node:14-alpine

ARG NODE_ENV=production
ENV NODE_ENV=$NODE_ENV

WORKDIR /usr/src/app

COPY package.json yarn.lock ./

RUN yarn install --frozen-lockfile --no-cache --production

# Bundle app source
COPY . .

CMD [ "yarn", "start" ]

EXPOSE 8000
