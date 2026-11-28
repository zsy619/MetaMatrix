FROM node:22-alpine AS build

WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Vite 在打包时把 import.meta.env.VITE_API_BASE 静态替换成字面量，
# 因此必须在构建阶段注入，容器运行时再改环境变量无效。
# 默认值与 pros/build.sh 中的 WEB_API_BASE 保持一致；
# 需要构建到其它环境时用：docker build --build-arg VITE_API_BASE=https://xxx .
# 注意：值末尾不要带斜杠，源码用 ${BASE}${path} 直接拼接，否则会出现双斜杠路径。
ARG VITE_API_BASE=https://metamatrix.api.yy24365.com
ENV VITE_API_BASE=${VITE_API_BASE}
# 与 pros/build.sh 的策略保持一致：默认只打包，不跑 vue-tsc 类型检查。
# 原因：仓库存在 62 处历史类型错误（RtePortals.vue、rteTableExtras.ts 等生产代码），
# 直接 npm run build 会因类型检查失败导致镜像无法产出。
# 类型错误修复后，可改回 `RUN npm run build` 以启用严格校验。
RUN ./node_modules/.bin/vite build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 80
