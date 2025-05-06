FROM node:20-alpine as build

WORKDIR /app

COPY package*.json ./

RUN npm install --force

RUN npm install -g @angular/cli

COPY . .

RUN ng build --configuration=production

FROM nginx:latest

# Copy the custom nginx config
COPY default.conf /etc/nginx/conf.d

# Copy the built Angular app
COPY --from=build /app/dist/client /usr/share/nginx/html

EXPOSE 80
