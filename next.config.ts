import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    // 로컬 public 폴더 이미지는 별도 설정 불필요
    // 외부 이미지 도메인이 생기면 여기에 추가
    remotePatterns: [],
    // 기본(75) 외에 로고처럼 선명도가 중요한 이미지에 quality={100}을 쓰기 위해 허용 목록에 추가
    qualities: [75, 100],
  },
}

export default nextConfig