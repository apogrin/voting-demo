// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Simple On-Chain Voting (Classroom Demo, multi-instructor)
contract Voting {
    /* ───────────── Ownable ───────────── */
    address public owner;
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
        // Deployer is an instructor by default
        isInstructor[msg.sender] = true;
        emit InstructorAdded(msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /* ─────────── Instructors ─────────── */
    mapping(address => bool) public isInstructor;
    event InstructorAdded(address indexed account);
    event InstructorRemoved(address indexed account);

    modifier onlyInstructor() {
        require(isInstructor[msg.sender], "Not instructor");
        _;
    }

    function addInstructor(address account) external onlyOwner {
        require(account != address(0), "Zero address");
        require(!isInstructor[account], "Already instructor");
        isInstructor[account] = true;
        emit InstructorAdded(account);
    }

    function removeInstructor(address account) external onlyOwner {
        require(isInstructor[account], "Not instructor");
        isInstructor[account] = false;
        emit InstructorRemoved(account);
    }

    /* ─────────────── Polls ───────────── */
    struct Poll {
        string question;
        string[] options;
        uint256[] votes;
        bool isOpen;
        mapping(address => bool) voted;
    }

    Poll[] private _polls;

    event PollCreated(uint256 indexed pollId, string question, string[] options);
    event VoteCast(uint256 indexed pollId, address indexed voter, uint256 optionIndex);
    event PollClosed(uint256 indexed pollId);

    /* ───────── Create / Close (instructors) ───────── */
    function createPoll(string calldata question, string[] calldata options)
        external
        onlyInstructor
        returns (uint256 pollId)
    {
        require(bytes(question).length > 0, "Empty question");
        require(options.length >= 2 && options.length <= 10, "Need 2-10 options");

        _polls.push();
        pollId = _polls.length - 1;
        Poll storage p = _polls[pollId];
        p.question = question;
        p.isOpen = true;

        for (uint256 i = 0; i < options.length; i++) {
            require(bytes(options[i]).length > 0, "Empty option");
            p.options.push(options[i]);
            p.votes.push(0);
        }

        emit PollCreated(pollId, question, p.options);
    }

    function closePoll(uint256 pollId) external onlyInstructor {
        require(pollId < _polls.length, "Bad pollId");
        Poll storage p = _polls[pollId];
        require(p.isOpen, "Already closed");
        p.isOpen = false;
        emit PollClosed(pollId);
    }

    /* ─────────────── Voting ─────────────── */
    function vote(uint256 pollId, uint256 optionIndex) external {
        require(pollId < _polls.length, "Bad pollId");
        Poll storage p = _polls[pollId];
        require(p.isOpen, "Poll closed");
        require(optionIndex < p.options.length, "Bad option");
        require(!p.voted[msg.sender], "Already voted");

        p.voted[msg.sender] = true;
        p.votes[optionIndex] += 1;

        emit VoteCast(pollId, msg.sender, optionIndex);
    }

    /* ─────────────── Views ─────────────── */
    function getPollCount() external view returns (uint256) {
        return _polls.length;
    }

    function getPoll(uint256 pollId)
        external
        view
        returns (string memory question, string[] memory options, uint256[] memory votes, bool isOpen)
    {
        require(pollId < _polls.length, "Bad pollId");
        Poll storage p = _polls[pollId];
        question = p.question;
        isOpen = p.isOpen;

        uint256 n = p.options.length;
        options = new string[](n);
        votes   = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            options[i] = p.options[i];
            votes[i]   = p.votes[i];
        }
    }

    function getOptionCount(uint256 pollId) external view returns (uint256) {
        require(pollId < _polls.length, "Bad pollId");
        return _polls[pollId].options.length;
    }

    function hasVoted(uint256 pollId, address voter) external view returns (bool) {
        require(pollId < _polls.length, "Bad pollId");
        return _polls[pollId].voted[voter];
    }
}
