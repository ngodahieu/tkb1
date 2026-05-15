import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { initializeApp, getApps } from "firebase/app";
import {
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  setDoc,
} from "firebase/firestore";

// ✅ Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyCUR48lDwfooMLmFcJAFUV1_wHKMGIhsdc",
  authDomain: "study-planner-a18d8.firebaseapp.com",
  projectId: "study-planner-a18d8",
  storageBucket: "study-planner-a18d8.appspot.com",
  messagingSenderId: "1077143017495",
  appId: "1:1077143017495:web:d95ccb59beee053fbee452",
};

// ✅ Initialize Firebase safely
const app = getApps().length > 0
  ? getApps()[0]
  : initializeApp(firebaseConfig);

// ✅ Firestore
const db = getFirestore(app);

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type AvailabilityMap = {
  [key: string]: string;
};

type UserSchedule = {
  id?: string;
  name: string;
  availability: AvailabilityMap;
  updatedAt?: number;
};

const toMinutes = (value: string): number | null => {
  if (!value || typeof value !== "string") {
    return null;
  }

  if (!value.includes(":")) {
    return null;
  }

  const parts = value.split(":");

  if (parts.length < 2) {
    return null;
  }

  const h = Number(parts[0]);
  const m = Number(parts[1]);

  if (Number.isNaN(h) || Number.isNaN(m)) {
    return null;
  }

  return h * 60 + m;
};

const formatTime = (minutes: number): string => {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");

  const m = (minutes % 60)
    .toString()
    .padStart(2, "0");

  return `${h}:${m}`;
};

const parseRanges = (input: string): number[][] => {
  if (!input || typeof input !== "string") {
    return [];
  }

  return input
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((range) => {
      if (!range.includes("-")) {
        return null;
      }

      const [startText, endText] = range.split("-");

      if (!startText || !endText) {
        return null;
      }

      const start = toMinutes(startText.trim());
      const end = toMinutes(endText.trim());

      if (start === null || end === null) {
        return null;
      }

      if (start >= end) {
        return null;
      }

      return [start, end];
    })
    .filter(Boolean) as number[][];
};

const sortTimeRanges = (value: string): string => {
  if (!value) {
    return "";
  }

  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .sort((a, b) => {
      const aStart = a.split("-")[0]?.trim() || "00:00";
      const bStart = b.split("-")[0]?.trim() || "00:00";

      return (
        (toMinutes(aStart) || 0) -
        (toMinutes(bStart) || 0)
      );
    })
    .join(", ");
};

export default function StudyPlanner() {
  const [name, setName] = useState("");

  const [loggedInUser, setLoggedInUser] = useState(() => {
    if (typeof window === "undefined") {
      return "";
    }

    return localStorage.getItem("study-user") || "";
  });

  const [availability, setAvailability] =
    useState<AvailabilityMap>({});

  const [data, setData] = useState<UserSchedule[]>([]);

  const [darkMode, setDarkMode] = useState(true);

  const [error, setError] = useState("");

  // ✅ Firebase realtime sync
  useEffect(() => {
    try {
      const unsubscribe = onSnapshot(
        collection(db, "studySchedules"),
        (snapshot) => {
          const users: UserSchedule[] = snapshot.docs.map((docItem) => ({
            id: docItem.id,
            ...(docItem.data() as UserSchedule),
          }));

          users.sort((a, b) => {
            return (b.updatedAt || 0) - (a.updatedAt || 0);
          });

          setData(users);

          const currentUser = users.find(
            (u) => u.name === loggedInUser
          );

          if (currentUser) {
            setAvailability(currentUser.availability || {});
          }
        },
        (err) => {
          console.error(err);
          setError("Firebase connection failed.");
        }
      );

      return () => unsubscribe();
    } catch (err) {
      console.error(err);
      setError("Firebase initialization failed.");
    }
  }, [loggedInUser]);

  const handleLogin = () => {
    if (!name.trim()) {
      return;
    }

    localStorage.setItem("study-user", name.trim());

    setLoggedInUser(name.trim());

    setName("");
  };

  const handleLogout = () => {
    localStorage.removeItem("study-user");
    setLoggedInUser("");
    setAvailability({});
  };

  const handleChange = (
    day: string,
    value: string
  ) => {
    setAvailability((prev) => ({
      ...prev,
      [day]: value,
    }));
  };

  const handleDeleteSingleValue = (
    day: string,
    valueToDelete: string
  ) => {
    const current = availability[day] || "";

    const updated = current
      .split(",")
      .map((v) => v.trim())
      .filter((v) => v && v !== valueToDelete)
      .join(", ");

    setAvailability((prev) => ({
      ...prev,
      [day]: updated,
    }));
  };

  const handleSubmit = async () => {
    if (!loggedInUser.trim()) {
      return;
    }

    try {
      const sortedAvailability: AvailabilityMap = {};

      DAYS.forEach((day) => {
        sortedAvailability[day] = sortTimeRanges(
          availability[day] || ""
        );
      });

      await setDoc(doc(db, "studySchedules", loggedInUser), {
        name: loggedInUser,
        availability: sortedAvailability,
        updatedAt: Date.now(),
      });
    } catch (err) {
      console.error(err);
      setError("Failed to save timetable.");
    }
  };

  const handleDeleteMyData = async () => {
    if (!loggedInUser) {
      return;
    }

    try {
      await deleteDoc(doc(db, "studySchedules", loggedInUser));
      setAvailability({});
    } catch (err) {
      console.error(err);
      setError("Failed to delete data.");
    }
  };

  const overlaps = useMemo(() => {
    const result: {
      day: string;
      start: number;
      end: number;
      people: number;
      users: string[];
    }[] = [];

    DAYS.forEach((day) => {
      const timeline: {
        start: number;
        end: number;
        user: string;
      }[] = [];

      data.forEach((user) => {
        const ranges = parseRanges(
          user.availability?.[day] || ""
        );

        ranges.forEach((range) => {
          timeline.push({
            start: range[0],
            end: range[1],
            user: user.name,
          });
        });
      });

      for (let hour = 0; hour < 24 * 60; hour += 30) {
        const slotStart = hour;
        const slotEnd = hour + 30;

        const matchedUsers = timeline
          .filter((range) => {
            return (
              range.start <= slotStart &&
              range.end >= slotEnd
            );
          })
          .map((r) => r.user);

        if (matchedUsers.length >= 2) {
          result.push({
            day,
            start: slotStart,
            end: slotEnd,
            people: matchedUsers.length,
            users: [...new Set(matchedUsers)],
          });
        }
      }
    });

    return result.sort((a, b) => {
      if (b.people !== a.people) {
        return b.people - a.people;
      }

      return a.start - b.start;
    });
  }, [data]);

  return (
    <div
      className={`min-h-screen p-6 transition-colors duration-300 ${
        darkMode
          ? "bg-gray-900 text-white"
          : "bg-gray-100 text-black"
      }`}
    >
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">
          📚 Study Planner
        </h1>

        <Button onClick={() => setDarkMode(!darkMode)}>
          {darkMode ? "☀️ Light" : "🌙 Dark"}
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl bg-red-500/20 p-4 text-red-300">
          ⚠️ {error}
        </div>
      )}

      {!loggedInUser ? (
        <Card className="mb-6 rounded-2xl shadow-lg border-yellow-400/30 bg-gradient-to-br from-yellow-500/10 to-orange-500/10 backdrop-blur">
        <CardContent className="p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="text-3xl">🤖</div>

            <div>
              <h2 className="text-2xl font-bold">
                AI Auto Timetable Suggestion
              </h2>

              <p className="opacity-70">
                Hệ thống tự tìm khung giờ có nhiều người rảnh nhất
              </p>
            </div>
          </div>

          {overlaps.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center opacity-70">
              Chưa đủ dữ liệu để AI đề xuất lịch học
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {overlaps.slice(0, 12).map((item, index) => (
                <div
                  key={`${item.day}-${item.start}-${index}`}
                  className={`rounded-2xl border p-4 transition-all duration-300 hover:scale-[1.02] ${
                    index === 0
                      ? "border-green-400 bg-green-500/20 shadow-lg shadow-green-500/20"
                      : "border-white/10 bg-white/5"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-lg font-bold">
                      📅 {item.day}
                    </div>

                    <div className="rounded-full bg-blue-500/20 px-3 py-1 text-sm font-semibold text-blue-300">
                      {item.people} people
                    </div>
                  </div>

                  <div className="mb-3 text-2xl font-black text-yellow-300">
                    {formatTime(item.start)} - {formatTime(item.end)}
                  </div>

                  <div className="mb-2 text-sm opacity-70">
                    Available users:
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {item.users.map((user) => (
                      <div
                        key={user}
                        className="rounded-full bg-green-500/20 px-3 py-1 text-sm"
                      >
                        👤 {user}
                      </div>
                    ))}
                  </div>

                  {index === 0 && (
                    <div className="mt-4 rounded-xl bg-yellow-400/20 p-2 text-center text-sm font-bold text-yellow-200">
                      ⭐ BEST AI MATCH
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      ) : (
        <Card className="mb-6 rounded-2xl shadow-lg">
          <CardContent className="grid gap-4 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">
                👋 Hello, {loggedInUser}
              </h2>

              <Button
                variant="outline"
                onClick={handleLogout}
              >
                Logout
              </Button>
            </div>

            {DAYS.map((day) => (
              <div key={day}>
                <div className="mb-1 font-semibold">
                  {day}
                </div>

                <Input
                  placeholder="08:00 - 10:00, 18:00 - 21:00"
                  value={availability[day] || ""}
                  onChange={(e) =>
                    handleChange(day, e.target.value)
                  }
                />

                {availability[day] && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {availability[day]
                      .split(",")
                      .map((time, idx) => {
                        const trimmed = time.trim();

                        if (!trimmed) {
                          return null;
                        }

                        return (
                          <div
                            key={idx}
                            className="flex items-center gap-2 rounded-full bg-green-500/20 px-3 py-1 text-sm"
                          >
                            <span>{trimmed}</span>

                            <button
                              type="button"
                              className="font-bold text-red-400"
                              onClick={() =>
                                handleDeleteSingleValue(day, trimmed)
                              }
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            ))}

            <div className="flex flex-wrap gap-3">
              <Button onClick={handleSubmit}>
                Submit Timetable
              </Button>

              <Button
                variant="destructive"
                onClick={handleDeleteMyData}
              >
                🗑 Delete My Data
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mb-6 rounded-2xl shadow-lg">
        <CardContent className="p-6">
          <h2 className="mb-3 text-lg font-bold">
            🤖 Suggested Best Time
          </h2>

          {Object.keys(overlaps).length === 0 ? (
            <p className="opacity-70">
              Chưa có khoảng thời gian trùng nhau
            </p>
          ) : (
            Object.entries(overlaps).map(([day, time]) => (
              <div
                key={day}
                className="mb-2 rounded-lg bg-yellow-300 p-2 font-semibold text-black"
              >
                👉 {day}: {time}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-lg">
        <CardContent className="overflow-x-auto p-6">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="border p-3">Name</th>

                {DAYS.map((day) => (
                  <th key={day} className="border p-3">
                    {day}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {data.map((user, index) => (
                <tr key={user.id || index}>
                  <td className="border bg-blue-500/20 p-3 font-bold">
                    👤 {user.name}
                  </td>

                  {DAYS.map((day) => (
                    <td
                      key={day}
                      className="border p-2 align-top"
                    >
                      {user.availability?.[day] ? (
                        <div className="space-y-1 text-left">
                          {user.availability[day]
                            .split(",")
                            .map((time, idx) => (
                              <div
                                key={idx}
                                className="rounded bg-green-500/20 px-2 py-1"
                              >
                                • {time.trim()}
                              </div>
                            ))}
                        </div>
                      ) : (
                        <span className="opacity-40">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
