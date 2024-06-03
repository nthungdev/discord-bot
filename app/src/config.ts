export default {
  requiredEnvs: [
    'TOKEN',
    'SLEEP_REMINDER_SERVER_ID',
    'AI_API_KEY',
    'CLIENT_ID',
    'BEARER_TOKEN',
  ],
  checkInReportTemplate: `📢 Báo Cáo Điểm Danh (beta) {date} 📢

Tổng Số Lượt Điểm Danh Trong Tháng {month}: {totalCheckIns}

🔥 Chuỗi Điểm Danh Nóng 🔥

Xin chúc mừng {longestStreakUser} đã duy trì chuỗi điểm danh dài nhất với {longestStreakCount} ngày điểm danh liên tiếp!

👑 Quán Quân Điểm Danh 👑

Một tràng pháo tay thật lớn dành cho {topCheckInUser} với tổng số {topCheckInCount} điểm danh trong tháng!

Tiếp tục phát huy nhé mọi người! Hãy cùng nhau nâng cao số ngày và số lượt điểm danh nào! 🚀

Bảng Xếp Hạng:

Chuỗi Điểm Danh:

{streaks}

Tổng Số Lượt Điểm Danh:

{counts}`,
}
