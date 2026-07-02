import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    // 로컬 public 폴더 이미지는 별도 설정 불필요
    // 외부 이미지 도메인이 생기면 여기에 추가
    remotePatterns: [],
  },
}

export default nextConfig