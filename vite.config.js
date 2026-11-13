import { defineConfig } from 'vite';

// 상대 경로 빌드: 포털의 하위 경로(/games/petal-blocks/)와 독립 배포 모두에서 동작합니다.
export default defineConfig({ base: './' });
