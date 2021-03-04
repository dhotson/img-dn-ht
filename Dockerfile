FROM node:14-alpine

ARG NODE_ENV=production
ENV NODE_ENV=$NODE_ENV

WORKDIR /usr/src/app
COPY \
  package.json \
  yarn.lock \
  tsconfig.json \
  ./

RUN yarn install --frozen-lockfile --production

COPY src ./src

CMD [ "yarn", "start" ]

EXPOSE 8000
