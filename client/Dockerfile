FROM node:20-alpine as build

WORKDIR /app

COPY package*.json ./

RUN npm install --force

RUN npm install -g @angular/cli

COPY . .

# Accept build environment argument (defaults to production)
ARG BUILD_ENV=production
RUN ng build --configuration=$BUILD_ENV

FROM nginx:latest

# Copy the custom nginx config
COPY default.conf /etc/nginx/conf.d

# Copy the built Angular app
COPY --from=build /app/dist/client /usr/share/nginx/html

EXPOSE 80
