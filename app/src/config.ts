export default {
  requiredEnvs: [
    'TOKEN',
    'SLEEP_REMINDER_SERVER_ID',
    'AI_API_KEY',
    'CLIENT_ID',
    'BEARER_TOKEN',
  ],
  checkInReportTemplate: `📢 Báo Cáo Điểm Danh {date} 📢

Tổng Số Lượt Điểm Danh: **{totalCheckIns}**

👑 Quán Quân Điểm Danh 👑

Một tràng pháo tay thật lớn dành cho {topCheckInUser} với tổng số {topCheckInCount} điểm danh trong tháng!

Tiếp tục phát huy nhé mọi người! Hãy cùng nhau nâng cao số ngày và số lượt điểm danh nào! 🚀

🏆 Bảng Xếp Hạng 🏆

{counts}`,
}
