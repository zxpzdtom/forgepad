// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "ForgePadHost",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(name: "ForgePadHost", targets: ["ForgePadHost"])
    ],
    targets: [
        .executableTarget(
            name: "ForgePadHost",
            resources: [
                .process("Resources")
            ]
        )
    ]
)
